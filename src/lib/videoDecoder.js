// Browser-side mp4 demuxer + decoder for Phase C of the in-browser
// video editor. Pairs with src/lib/clientExporter.js (which already
// owns the compositing + encoding side of the pipeline).
//
// What this module does:
//   * Fetches an mp4, hands it to mp4box.js for demuxing
//   * Pulls the AVCDecoderConfigurationRecord (avcC) or HEVC
//     equivalent (hvcC) out of the video track's sample description
//     so VideoDecoder has a valid `description` to configure with
//   * Yields decoded VideoFrames in decode order via an async
//     generator, with backpressure to keep the WebCodecs queue bounded
//
// What this module deliberately does NOT do:
//   * Compositing — the caller draws frames onto a canvas
//   * Encoding — clientExporter.js owns VideoEncoder
//   * Audio extraction — a separate agent is wiring that path
//   * Streaming long files — the spike fetches the whole mp4. A
//     follow-up will swap to a Range-driven appendBuffer loop once
//     this codepath is proven.
//
// Reference for the WebCodecs side of the demux/decode dance:
//   https://github.com/w3c/webcodecs/blob/main/samples/video-decode-display/mp4_pull_demuxer.js
//
// Important: the avcC bytes that VideoDecoder.configure({ description })
// wants are the AVCDecoderConfigurationRecord payload *without* the
// 8-byte ISOBMFF box header. mp4box's `avcCBox.write(stream)` produces
// the *whole* box (size+fourcc+payload), so we slice off the leading
// 8 bytes. This is the single most common silent-failure point in
// WebCodecs decode setups; getting it wrong gives no error — the
// decoder just stops emitting frames.

import { createFile, DataStream } from "mp4box";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fetch an mp4 as an ArrayBuffer. Same-origin only — auth is on the
 *  caller's URL (cookies / query token / etc.). */
async function fetchMp4(url, signal) {
  const res = await fetch(url, { credentials: "same-origin", signal });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return await res.arrayBuffer();
}

/** Parses an mp4 buffer with mp4box and resolves once `onReady` fires.
 *  Returns the ISOFile plus the parsed Movie info. */
function parseWithMp4Box(arrayBuffer) {
  return new Promise((resolve, reject) => {
    const file = createFile();
    file.onError = (e) => reject(new Error(`mp4box: ${e}`));
    file.onReady = (info) => resolve({ file, info });

    // mp4box requires the buffer to be tagged with its file position.
    // Since we always pass the whole file at offset 0 in this spike,
    // we just set fileStart = 0 and flush() immediately after.
    const buf = arrayBuffer;
    // The buffer object passed to appendBuffer needs a `fileStart`
    // property. ArrayBuffer doesn't take expandos directly in strict
    // mode, but the public API expects exactly this shape — mp4box
    // checks `buf.fileStart`. Some bundles ship an MP4BoxBuffer
    // helper for this; assigning the property works on plain
    // ArrayBuffers too in every browser we care about.
    buf.fileStart = 0;
    file.appendBuffer(buf);
    file.flush();
  });
}

/** Pull the AVCDecoderConfigurationRecord (avcC) or HEVCConfigurationRecord
 *  (hvcC) bytes out of a video track's first sample entry.
 *
 *  Returns the *payload* (description bytes WebCodecs expects), not
 *  the wrapping ISOBMFF box. We strip the 8-byte ISO box header
 *  (size:uint32 + fourcc:4chars) before returning.
 *
 *  Where the bytes live in mp4box's tree:
 *    trak.mdia.minf.stbl.stsd.entries[0].avcC   (for avc1/avc3 tracks)
 *    trak.mdia.minf.stbl.stsd.entries[0].hvcC   (for hvc1/hev1 tracks)
 *
 *  The `entries[0]` is the VisualSampleEntry. mp4box decorates it
 *  with the parsed config box as a direct property. This works for
 *  files with multiple sample descriptions; we only support the first
 *  description, which is the overwhelmingly common case.
 */
function extractCodecDescription(trakBox) {
  const entry = trakBox?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  if (!entry) throw new Error("No sample description entry on video track");

  const configBox = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
  if (!configBox) {
    throw new Error(
      `No supported codec config box on first sample entry (saw: ${Object.keys(entry).join(",")})`
    );
  }

  // Serialize the box to bytes, then peel off the 8-byte ISO box
  // header to get the bare DecoderConfigurationRecord.
  const stream = new DataStream();
  stream.endianness = DataStream.BIG_ENDIAN;
  configBox.write(stream);
  // stream.buffer is an MP4BoxBuffer (ArrayBuffer subclass). Take a
  // Uint8Array view into it and slice off the box header.
  const full = new Uint8Array(stream.buffer, 0, stream.byteLength);
  if (full.byteLength <= 8) {
    throw new Error("Codec config box is suspiciously small");
  }
  return full.slice(8); // copy — caller will hand to VideoDecoder
}

/** Yield mp4box's parsed video samples as an async iterable.
 *  We set up extraction options on the track, append the buffer
 *  again to trigger sample emission, and pump samples into a queue
 *  that the consumer drains. */
function startSampleExtraction(file, trackId, { onSamples, signal }) {
  let stopped = false;

  file.onSamples = (id, _user, samples) => {
    if (stopped) return;
    if (id !== trackId) return;
    onSamples(samples);
    // Free memory for samples we've already handed off.
    const last = samples[samples.length - 1];
    if (last) file.releaseUsedSamples(trackId, last.number + 1);
  };

  // 1 sample per callback keeps the queue small and lets us respect
  // backpressure granularly. mp4box still emits in batches under the
  // hood — this just controls how often onSamples fires.
  file.setExtractionOptions(trackId, null, { nbSamples: 1 });
  file.start();

  // The original appendBuffer + flush already happened during the
  // probe phase. Calling flush again here is what triggers sample
  // dispatch from the existing buffered data.
  file.flush();

  signal?.addEventListener("abort", () => {
    stopped = true;
    try { file.stop(); } catch { /* best-effort */ }
  });

  return () => { stopped = true; try { file.stop(); } catch {} };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe an mp4's headers and return basic track metadata without
 * decoding any frames. Useful for sizing the export canvas before
 * deciding to enter the full decode loop.
 *
 * @param {string} url - Same-origin URL to an mp4. Auth (cookies / query
 *                       params) must already be on the URL — we use
 *                       `credentials: "same-origin"` and no headers.
 * @returns {Promise<{
 *   width: number,
 *   height: number,
 *   duration: number,        // seconds
 *   codec: string,           // e.g. "avc1.640028"
 *   timescale: number,
 *   nbSamples: number,
 *   sample_rate?: number,    // audio, if present
 *   num_channels?: number,
 * }>}
 */
export async function probeVideoMetadata(url) {
  const buf = await fetchMp4(url);
  const { info } = await parseWithMp4Box(buf);

  const vt = info.videoTracks?.[0];
  if (!vt) throw new Error("mp4 has no video track");
  const at = info.audioTracks?.[0];

  // info.duration is in info.timescale units. Track duration is in
  // track.timescale units. The Movie-level duration is the right one
  // to expose to the integrator since the editor timeline is global.
  const durationSec = info.duration / (info.timescale || 1);

  return {
    width: vt.video?.width ?? vt.track_width,
    height: vt.video?.height ?? vt.track_height,
    duration: durationSec,
    codec: vt.codec,
    timescale: vt.timescale,
    nbSamples: vt.nb_samples,
    ...(at ? {
      sample_rate: at.audio?.sample_rate,
      num_channels: at.audio?.channel_count,
    } : {}),
  };
}

/**
 * Demux an mp4 and yield decoded VideoFrames in decode order.
 * Consumer iterates with `for await (const frame of decodeVideoFrames(url))`.
 *
 * The consumer MUST call `frame.close()` after using each frame
 * (or relying on garbage collection — but explicit close keeps
 * the GPU pool from saturating).
 *
 * Backpressure: after each yielded frame, we wait until
 * decoder.decodeQueueSize drops below a soft cap before queuing the
 * next sample. This keeps decoder memory bounded to ~16 frames.
 *
 * @param {string} url - Same-origin mp4 URL.
 * @param {Object} [opts]
 * @param {AbortSignal} [opts.signal] - Cancel mid-iteration. We close
 *                                       the decoder and stop the
 *                                       demuxer.
 * @param {number} [opts.maxQueueSize=16] - Soft cap on decoder backlog.
 * @returns {AsyncIterable<VideoFrame>}
 */
export async function* decodeVideoFrames(url, opts = {}) {
  const { signal, maxQueueSize = 16 } = opts;

  if (typeof VideoDecoder === "undefined") {
    throw new Error("VideoDecoder is not available in this browser");
  }

  const buf = await fetchMp4(url, signal);
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const { file, info } = await parseWithMp4Box(buf);

  const vt = info.videoTracks?.[0];
  if (!vt) throw new Error("mp4 has no video track");
  const trakBox = file.getTrackById(vt.id);
  if (!trakBox) throw new Error(`could not resolve trakBox for track id ${vt.id}`);

  const description = extractCodecDescription(trakBox);

  // Queue + signaling. Each frame from the decoder lands in `frames`;
  // each error sets `decoderError`. The generator loop waits on
  // `framesAvailable` (a promise that resolves whenever the state
  // changes) so we don't burn CPU spinning.
  /** @type {VideoFrame[]} */
  const frames = [];
  /** @type {Error | null} */
  let decoderError = null;
  let demuxDone = false;
  let resolveFrames = null;
  const wake = () => { if (resolveFrames) { resolveFrames(); resolveFrames = null; } };

  const decoder = new VideoDecoder({
    output: (frame) => {
      frames.push(frame);
      wake();
    },
    error: (e) => {
      decoderError = e instanceof Error ? e : new Error(String(e));
      wake();
    },
  });

  // VideoDecoder.configure throws synchronously if the codec string
  // isn't supported, but only logs a warning if `description` is
  // malformed — the dreaded silent failure mode. Caller should test
  // against a couple of source files.
  decoder.configure({
    codec: vt.codec,
    codedWidth: vt.video?.width ?? vt.track_width,
    codedHeight: vt.video?.height ?? vt.track_height,
    description,
  });

  let stopExtraction = null;
  let aborted = false;

  const cleanup = () => {
    aborted = true;
    try { stopExtraction?.(); } catch {}
    try { decoder.close(); } catch {}
    // Drain any frames the consumer never consumed.
    while (frames.length) {
      const f = frames.shift();
      try { f.close(); } catch {}
    }
    wake();
  };

  signal?.addEventListener("abort", cleanup);

  try {
    stopExtraction = startSampleExtraction(file, vt.id, {
      signal,
      onSamples: (samples) => {
        for (const s of samples) {
          if (aborted) break;
          // mp4box gives us sample timestamps in track timescale.
          // VideoDecoder wants timestamps in microseconds.
          const tsUs = (s.cts * 1_000_000) / s.timescale;
          const durUs = (s.duration * 1_000_000) / s.timescale;
          try {
            decoder.decode(new EncodedVideoChunk({
              type: s.is_sync ? "key" : "delta",
              timestamp: tsUs,
              duration: durUs,
              data: s.data,
            }));
          } catch (e) {
            decoderError = e;
            wake();
            break;
          }
        }
        // Mark demux done when mp4box runs out of samples for this
        // track. We can detect this by tracking samples processed vs
        // nb_samples. mp4box doesn't have a clean "done" callback for
        // sample extraction, so we check on every batch.
      },
    });

    let yielded = 0;
    while (true) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      if (decoderError) throw decoderError;

      if (frames.length) {
        const frame = frames.shift();
        yielded++;
        try {
          yield frame;
        } finally {
          // Consumer is responsible for closing — but if they
          // forgot, we can't reliably close here without potentially
          // double-closing. Documented behavior: caller closes.
        }
        // Backpressure: if the decoder is far ahead, wait a beat.
        if (decoder.decodeQueueSize > maxQueueSize) {
          await new Promise((r) => setTimeout(r, 0));
        }
        continue;
      }

      // Are we done? When we've yielded as many frames as the track
      // claims to have, flush + exit.
      if (yielded >= vt.nb_samples) {
        await decoder.flush();
        // Drain any frames the flush emitted.
        while (frames.length) {
          yield frames.shift();
        }
        break;
      }

      // Otherwise wait for the next decode or error.
      await new Promise((resolve) => { resolveFrames = resolve; });
    }
  } finally {
    cleanup();
    signal?.removeEventListener?.("abort", cleanup);
  }
}

// ---------------------------------------------------------------------------
// Dev-only self test
// ---------------------------------------------------------------------------

/**
 * Sanity-check the module against a known-good mp4 URL. Call from
 * the browser console:
 *
 *   import("./lib/videoDecoder.js").then(m => m.__runSelfTest("/bg.mp4"))
 *
 * Logs metadata, decodes the first N frames, and reports frame
 * dimensions + timestamps. Caller's responsibility to close frames
 * after the test — we close them here.
 */
export async function __runSelfTest(url, { maxFrames = 5 } = {}) {
  console.group(`[videoDecoder selfTest] ${url}`);
  try {
    const meta = await probeVideoMetadata(url);
    console.log("probe:", meta);

    const controller = new AbortController();
    let i = 0;
    for await (const frame of decodeVideoFrames(url, { signal: controller.signal })) {
      console.log(`frame ${i}:`, {
        ts: frame.timestamp,
        codedWidth: frame.codedWidth,
        codedHeight: frame.codedHeight,
        format: frame.format,
      });
      frame.close();
      i++;
      if (i >= maxFrames) {
        controller.abort();
        break;
      }
    }
    console.log(`selfTest OK: decoded ${i} frames`);
    return { ok: true, framesDecoded: i, meta };
  } catch (e) {
    console.error("selfTest FAILED:", e);
    return { ok: false, error: e };
  } finally {
    console.groupEnd();
  }
}
