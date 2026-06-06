// Browser-side audio extractor + (optional) mixer + AAC re-encoder for
// the client-side mp4 export pipeline. Sister module to
// src/lib/videoDecoder.js — same conventions (mp4box demuxing, async
// generators, explicit backpressure, JSDoc, ESM, plain JS).
//
// What this module does:
//   * Fetches an mp4 ("talking head" source), demuxes the AAC audio
//     track with mp4box.js, decodes it with AudioDecoder.
//   * Optionally fetches a second mp4 ("bg") whose audio is looped and
//     mixed against the first at a caller-supplied volume in [0, 1].
//   * Renders the (mixed or passthrough) signal through an
//     OfflineAudioContext at the target sample rate (so resampling
//     happens for free) and re-encodes it as AAC EncodedAudioChunks
//     with timestamps in microseconds, ready to hand to
//     mp4-muxer.addAudioChunk(chunk, meta).
//
// What this module deliberately does NOT do:
//   * Video — videoDecoder.js owns that path.
//   * Streaming long files — we fetch each mp4 in full and render the
//     whole timeline in one OfflineAudioContext pass. The bulletin
//     export use case is bounded (a few minutes max), so this is
//     simpler and faster than a chunk-streaming mixer.
//   * Muxing — clientExporter.js owns the muxer.
//
// The single most common silent-failure mode here is the AAC
// description bytes for AudioDecoder.configure({ description }). For
// AVC the trap is "did you strip the box header"; for AAC the trap is
// "did you reach into the esds box and extract the
// AudioSpecificConfig (DecoderSpecificInfo payload) — not the whole
// esds, not the DecoderConfigDescriptor, not the ES_Descriptor". The
// AudioSpecificConfig is typically 2 bytes (5 bits objectType, 4 bits
// samplingFrequencyIndex, 4 bits channelConfig, 3 bits trailing) for
// plain AAC-LC. Getting it wrong gives no error — the decoder just
// emits silence or stops.
//
// Reference for the AAC description shape:
//   https://www.w3.org/TR/webcodecs-aac-codec-registration/

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

    const buf = arrayBuffer;
    // mp4box expects a `fileStart` expando. ArrayBuffers accept it in
    // every browser we care about. See videoDecoder.js for the
    // reasoning.
    buf.fileStart = 0;
    file.appendBuffer(buf);
    file.flush();
  });
}

// ---------------------------------------------------------------------------
// AAC AudioSpecificConfig extraction
// ---------------------------------------------------------------------------
//
// For an mp4 AAC track, the bytes WebCodecs wants in
// AudioDecoder.configure({ description }) are the AudioSpecificConfig
// (a.k.a. DecoderSpecificInfo payload). Those bytes live nested inside
// the esds box like so (ISO/IEC 14496-1 §7.2.6.5):
//
//   esds (FullBox)            <- box header + 4 bytes version/flags
//     ES_Descriptor (tag 0x03)
//       DecoderConfigDescriptor (tag 0x04)
//         object_type_indication + streamType + buffer/bitrate fields
//         DecoderSpecificInfo (tag 0x05)
//           <-- THESE bytes are what we want -->
//         SLConfigDescriptor (tag 0x06)
//
// Each descriptor carries a 1-byte tag, then a variable-length size
// (1–4 bytes, each with the high bit set if another size byte
// follows). We walk the descriptors looking for tag 0x05 and return
// its payload.
//
// Why not use mp4box's parsed `.esds` properties? The library does
// expose some of these (e.g. `esds.esd.dec_config_descriptor.dec_specific_info.data`),
// but the exact path varies across mp4box.js minor releases, and a
// silent miss here is fatal. Parsing the raw bytes ourselves is ~30
// lines and bulletproof.

/** Read a variable-length BER-style length from `bytes` starting at
 *  `offset`. Returns { length, newOffset }. Up to 4 size bytes. */
function readBerLength(bytes, offset) {
  let length = 0;
  let newOffset = offset;
  for (let i = 0; i < 4; i++) {
    const b = bytes[newOffset++];
    length = (length << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return { length, newOffset };
}

/** Walk an ES_Descriptor blob and return the DecoderSpecificInfo
 *  payload bytes (i.e. the AudioSpecificConfig for AAC tracks). */
function extractAudioSpecificConfig(esBytes) {
  // esBytes starts at the ES_Descriptor tag (0x03).
  let off = 0;
  if (esBytes[off++] !== 0x03) {
    throw new Error(`esds: expected ES_Descriptor tag 0x03, got 0x${esBytes[off - 1].toString(16)}`);
  }
  let len = readBerLength(esBytes, off); off = len.newOffset;

  // ES_Descriptor body: ES_ID(2) + flags(1)
  // If streamDependenceFlag set → +2; if URL_Flag set → +1+URLlen;
  // if OCRstreamFlag set → +2.
  const esId = (esBytes[off] << 8) | esBytes[off + 1]; off += 2;
  void esId;
  const flags = esBytes[off++];
  if (flags & 0x80) off += 2;                        // streamDependenceFlag
  if (flags & 0x40) { const urlLen = esBytes[off++]; off += urlLen; }
  if (flags & 0x20) off += 2;                        // OCRstreamFlag

  // Now expect DecoderConfigDescriptor (tag 0x04).
  if (esBytes[off++] !== 0x04) {
    throw new Error(`esds: expected DecoderConfigDescriptor 0x04, got 0x${esBytes[off - 1].toString(16)}`);
  }
  len = readBerLength(esBytes, off); off = len.newOffset;

  // DecoderConfigDescriptor body: 13 fixed bytes before any nested
  // descriptors (objectTypeIndication(1) + streamType/upStream/reserved(1)
  // + bufferSizeDB(3) + maxBitrate(4) + avgBitrate(4)).
  off += 13;

  // Then DecoderSpecificInfo (tag 0x05) — what we want.
  if (esBytes[off++] !== 0x05) {
    throw new Error(`esds: expected DecoderSpecificInfo 0x05, got 0x${esBytes[off - 1].toString(16)}`);
  }
  len = readBerLength(esBytes, off); off = len.newOffset;

  if (off + len.length > esBytes.length) {
    throw new Error(`esds: DecoderSpecificInfo length ${len.length} overruns blob (${esBytes.length - off} left)`);
  }
  return esBytes.slice(off, off + len.length);
}

/** Pull the AAC description bytes out of an audio track's first
 *  sample entry. Walks the esds box raw bytes (more reliable than
 *  mp4box's named properties across releases).
 *
 *  Returns a Uint8Array containing just the AudioSpecificConfig —
 *  typically 2 bytes for AAC-LC, longer for HE-AAC / xHE-AAC.
 */
function extractAacDescription(trakBox) {
  const entry = trakBox?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  if (!entry) throw new Error("No sample description entry on audio track");

  // The esds box hangs off the AudioSampleEntry. mp4box names it
  // entry.esds. Serialize the whole box, then peel off:
  //   * 8 bytes ISOBMFF box header (size + 'esds' fourcc)
  //   * 4 bytes FullBox version + flags
  // …to land on the ES_Descriptor tag 0x03.
  const esdsBox = entry.esds;
  if (!esdsBox) {
    throw new Error(
      `No esds box on first audio sample entry (saw: ${Object.keys(entry).join(",")})`
    );
  }

  const stream = new DataStream();
  stream.endianness = DataStream.BIG_ENDIAN;
  esdsBox.write(stream);
  const full = new Uint8Array(stream.buffer, 0, stream.byteLength);
  if (full.byteLength <= 12) {
    throw new Error("esds box is suspiciously small");
  }
  // 8 header + 4 FullBox version/flags = 12.
  const esBytes = full.slice(12);
  return extractAudioSpecificConfig(esBytes);
}

// ---------------------------------------------------------------------------
// AAC PASSTHROUGH — drift-free, no decode, no encode.
// ---------------------------------------------------------------------------
//
// The server's V4 contract is "lipsync locked" precisely because the
// audio is `-c:a copy`'d through every ffmpeg pass — same bytes, same
// PTS, end to end. Any decode → re-encode round-trip introduces small
// timing/sample-count differences that desync from the video timeline
// (the V2/V3 drift bug). The fix on the client is the same fix as on
// the server: skip decode + encode for the talking-head audio, lift
// AAC samples straight out of mp4box and hand them to mp4-muxer
// verbatim. Each EncodedAudioChunk carries its original timestamp from
// the source mp4, so the output mp4's audio track is a bit-identical
// copy of the trimmed source's audio track.
//
// Use this whenever the operator has NOT asked for a bg-audio mix
// (bg_video_volume = 0, which is the default). When they HAVE asked
// for a mix the encode round-trip is unavoidable; see
// `encodeAudioStream` for that path (and warn the operator at the UI
// that drift is possible).

/**
 * Stream the raw AAC frames from `url`'s audio track as
 * EncodedAudioChunks with their original timestamps. No decoder, no
 * encoder, no resampling — the output muxer writes them as-is.
 *
 * The first yielded value carries `meta.decoderConfig` so the muxer
 * can advertise the same AAC config the source carries. Every
 * subsequent yield reuses that same meta (mp4-muxer accepts it on
 * every chunk; only the first one is load-bearing).
 *
 * @param {string} url - mp4 url, same-origin
 * @param {Object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @returns {AsyncGenerator<{chunk: EncodedAudioChunk, meta: any}>}
 *
 * Throws if the source has no audio track or no esds box.
 */
export async function* passthroughAacChunks(url, opts = {}) {
  const { signal } = opts;
  if (typeof EncodedAudioChunk === "undefined") {
    throw new Error("EncodedAudioChunk not available in this browser");
  }
  const buf = await fetchMp4(url, signal);
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const { file, info } = await parseWithMp4Box(buf);
  const at = info.audioTracks?.[0];
  if (!at) throw new Error("mp4 has no audio track");
  const trakBox = file.getTrackById(at.id);
  if (!trakBox) throw new Error(`could not resolve audio trakBox for track ${at.id}`);

  // Pull AudioSpecificConfig once — every chunk carries this same
  // meta so mp4-muxer can serialize a matching esds box on the output.
  const description = extractAacDescription(trakBox);
  const meta = {
    decoderConfig: {
      codec: at.codec, // "mp4a.40.2" for AAC-LC, etc.
      sampleRate: at.audio?.sample_rate ?? 48000,
      numberOfChannels: at.audio?.channel_count ?? 2,
      description,
    },
  };

  // Queue + signaling pattern (mirrors decodeVideoFrames). mp4box
  // dispatches samples in batches via onSamples; we push them into a
  // buffer the generator drains.
  /** @type {{chunk: EncodedAudioChunk, meta: any}[]} */
  const queue = [];
  let demuxDone = false;
  let wake = null;
  const signal_resolve = () => { if (wake) { wake(); wake = null; } };
  let samplesYielded = 0;
  let aborted = false;

  file.onSamples = (id, _user, samples) => {
    if (aborted) return;
    if (id !== at.id) return;
    for (const s of samples) {
      // mp4box gives us a Uint8Array view in the sample's `data`.
      // EncodedAudioChunk copies it on construction so re-using
      // mp4box's buffer (which it'll free below) is safe.
      const tsUs = (s.cts * 1_000_000) / s.timescale;
      const durUs = (s.duration * 1_000_000) / s.timescale;
      const chunk = new EncodedAudioChunk({
        // AAC frames are independently decodable — every frame is a
        // keyframe. mp4-muxer accepts "key" universally.
        type: "key",
        timestamp: tsUs,
        duration: durUs,
        data: s.data,
      });
      queue.push({ chunk, meta });
    }
    // Release demuxer memory for samples we've already consumed.
    const last = samples[samples.length - 1];
    if (last) file.releaseUsedSamples(at.id, last.number + 1);
    signal_resolve();
  };

  const cleanup = () => {
    aborted = true;
    demuxDone = true;
    try { file.stop(); } catch { /* best-effort */ }
    queue.length = 0;
    signal_resolve();
  };
  signal?.addEventListener("abort", cleanup);

  // 50 samples per callback keeps the queue movement amortised.
  file.setExtractionOptions(at.id, null, { nbSamples: 50 });
  file.start();
  // Trigger sample dispatch from the buffer we already appended.
  file.flush();

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      if (queue.length) {
        const item = queue.shift();
        samplesYielded++;
        yield item;
        // mp4box gives us samples until nb_samples is reached for the
        // track. Once we've yielded that many, we're done.
        if (samplesYielded >= (at.nb_samples || Infinity)) {
          break;
        }
        continue;
      }
      if (demuxDone) break;
      if (samplesYielded >= (at.nb_samples || 0) && at.nb_samples > 0) break;
      // Wait for the next batch of samples (or abort).
      await new Promise((r) => { wake = r; });
    }
  } finally {
    cleanup();
    signal?.removeEventListener?.("abort", cleanup);
  }
}

// ---------------------------------------------------------------------------
// Demux + decode: turn an mp4 audio track into a single AudioBuffer
// ---------------------------------------------------------------------------

/** Fetch + demux + decode an mp4's audio track end-to-end and return a
 *  single AudioBuffer rendered at the requested sample rate via
 *  OfflineAudioContext (which doubles as our resampler).
 *
 *  We collect all decoded AudioData frames into a Float32 PCM buffer
 *  in the source's native sample rate / channel count, wrap it in an
 *  AudioBuffer, then play it through an OfflineAudioContext that's
 *  configured at the *target* rate/channels. The offline context
 *  handles resampling and channel up/downmixing.
 *
 *  Returns null if the mp4 has no audio track. */
async function loadAudioAsBuffer(url, { sampleRate, channels, signal }) {
  const buf = await fetchMp4(url, signal);
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const { file, info } = await parseWithMp4Box(buf);

  const at = info.audioTracks?.[0];
  if (!at) return null;

  if (!at.codec?.startsWith("mp4a")) {
    // Not AAC (could be Opus, ac-3, etc.). WebCodecs AudioDecoder
    // supports more codecs than just mp4a, but this module is scoped
    // to the mp4 bulletin pipeline where AAC is the universal output.
    throw new Error(`unsupported audio codec '${at.codec}' (need mp4a/AAC)`);
  }

  const trakBox = file.getTrackById(at.id);
  if (!trakBox) throw new Error(`could not resolve trakBox for track id ${at.id}`);
  const description = extractAacDescription(trakBox);

  const srcRate = at.audio?.sample_rate || 48000;
  const srcChannels = at.audio?.channel_count || 2;
  const trackDurationSec = at.samples_duration / at.timescale;

  // Queue of decoded AudioData frames. We accumulate them in source
  // sample rate, then feed everything into an OfflineAudioContext for
  // resampling + channel matching.
  /** @type {AudioData[]} */
  const decodedFrames = [];
  /** @type {Error|null} */
  let decoderError = null;
  let wake = null;
  const signalChange = () => { if (wake) { wake(); wake = null; } };

  const decoder = new AudioDecoder({
    output: (frame) => { decodedFrames.push(frame); signalChange(); },
    error: (e) => { decoderError = e instanceof Error ? e : new Error(String(e)); signalChange(); },
  });

  decoder.configure({
    codec: at.codec,                       // e.g. "mp4a.40.2"
    sampleRate: srcRate,
    numberOfChannels: srcChannels,
    description,
  });

  // Pump samples from mp4box into the decoder.
  let samplesFed = 0;
  const totalSamples = at.nb_samples;
  let demuxDone = false;

  file.onSamples = (id, _user, samples) => {
    if (id !== at.id) return;
    for (const s of samples) {
      const tsUs = (s.cts * 1_000_000) / s.timescale;
      const durUs = (s.duration * 1_000_000) / s.timescale;
      try {
        decoder.decode(new EncodedAudioChunk({
          type: s.is_sync ? "key" : "delta",
          timestamp: tsUs,
          duration: durUs,
          data: s.data,
        }));
        samplesFed++;
      } catch (e) {
        decoderError = e;
        signalChange();
        return;
      }
    }
    const last = samples[samples.length - 1];
    if (last) file.releaseUsedSamples(at.id, last.number + 1);
    if (samplesFed >= totalSamples) {
      demuxDone = true;
      signalChange();
    }
  };

  file.setExtractionOptions(at.id, null, { nbSamples: 50 });
  file.start();
  file.flush();

  // Wait until decoder has emitted everything.
  await new Promise((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      if (decoderError) return reject(decoderError);
      if (demuxDone && decoder.decodeQueueSize === 0) return resolve();
      wake = tick;
    };
    tick();
  });

  await decoder.flush();
  decoder.close();
  try { file.stop(); } catch {}

  // Stitch decoded AudioData frames into a single Float32 PCM buffer
  // per channel at the *source* sample rate.
  let totalFrames = 0;
  for (const f of decodedFrames) totalFrames += f.numberOfFrames;
  const srcBuf = new AudioBuffer({
    length: Math.max(1, totalFrames),
    numberOfChannels: srcChannels,
    sampleRate: srcRate,
  });
  let writeOffset = 0;
  // AudioData.copyTo wants per-plane copies. Each AudioData may be
  // either interleaved ('s16', 'f32') or planar ('s16-planar',
  // 'f32-planar'). We request planar f32 explicitly to keep the
  // channel copy loop simple.
  for (const f of decodedFrames) {
    const n = f.numberOfFrames;
    for (let c = 0; c < srcChannels; c++) {
      const dest = new Float32Array(n);
      try {
        f.copyTo(dest, { planeIndex: c, format: "f32-planar" });
      } catch (e) {
        // Some browsers don't honor `format` override on copyTo.
        // Fall back to whatever the native format is and just copy
        // out plane c. If the source is interleaved, we deinterleave
        // ourselves below — but in practice AudioDecoder for AAC
        // emits f32-planar on Chromium/Safari/Firefox alike.
        f.copyTo(dest, { planeIndex: c });
      }
      srcBuf.getChannelData(c).set(dest, writeOffset);
    }
    writeOffset += n;
    f.close();
  }
  decodedFrames.length = 0;

  return {
    buffer: srcBuf,
    duration: trackDurationSec,
    sampleRate: srcRate,
    channels: srcChannels,
    description, // exposed for debugging via __runSelfTest
    codec: at.codec,
  };
}

// ---------------------------------------------------------------------------
// AudioEncoder config: branch for Chrome/Firefox vs Safari shape
// ---------------------------------------------------------------------------

/** Returns the first AAC config object the browser reports as
 *  supported. Chrome/Firefox accept the bare `{codec: "mp4a.40.2"}`
 *  shape. Safari historically wanted an extra `aac: { format: "aac" }`
 *  field, and on some versions wants `format: "aac"` at the top level
 *  (this is the WebCodecs AAC registration's "aac" vs "adts" choice).
 *  We try the candidates in order and return the first one
 *  isConfigSupported() OKs. */
async function pickAacEncoderConfig({ sampleRate, channels, bitrate = 128_000 }) {
  /** @type {AudioEncoderConfig[]} */
  const candidates = [
    // Plain — Chrome / Firefox happy path.
    { codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate },
    // Safari-style: explicit "aac" container hint nested. Safari's
    // WebCodecs AAC encoder rejects the bare config in some
    // versions and wants this shape; the spec calls this the
    // "aac" registration container marker.
    { codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate, aac: { format: "aac" } },
    // Another Safari variant — top-level format.
    { codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate, format: "aac" },
  ];
  for (const cfg of candidates) {
    try {
      const sup = await AudioEncoder.isConfigSupported(cfg);
      if (sup?.supported) return sup.config || cfg;
    } catch { /* try next */ }
  }
  throw new Error("No AAC encoder config supported in this browser");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe an mp4 and return its audio track metadata. Returns null if
 * the mp4 has no audio track. Throws on fetch/parse errors.
 *
 * @param {string} url
 * @returns {Promise<{
 *   sample_rate: number,
 *   num_channels: number,
 *   codec: string,           // e.g. "mp4a.40.2"
 *   duration: number,        // seconds
 * } | null>}
 */
export async function probeAudioMetadata(url) {
  const buf = await fetchMp4(url);
  const { info } = await parseWithMp4Box(buf);
  const at = info.audioTracks?.[0];
  if (!at) return null;
  const durationSec = (at.samples_duration || info.duration) / (at.timescale || info.timescale || 1);
  return {
    sample_rate: at.audio?.sample_rate ?? 0,
    num_channels: at.audio?.channel_count ?? 0,
    codec: at.codec,
    duration: durationSec,
  };
}

/**
 * Feature-detect AAC encoding support. Returns true iff the browser
 * exposes AudioEncoder and one of our candidate AAC configs validates.
 *
 * @returns {Promise<boolean>}
 */
export async function isAudioEncodingSupported() {
  if (typeof AudioEncoder === "undefined") return false;
  if (typeof AudioDecoder === "undefined") return false;
  try {
    await pickAacEncoderConfig({ sampleRate: 48000, channels: 2 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Demux mp4(s), decode + optionally mix, re-encode to AAC, and yield
 * EncodedAudioChunks with timestamps in microseconds aligned to the
 * output timeline (starting at 0).
 *
 * Single-track passthrough (no bgUrl): the talking-head audio is
 * decoded → resampled through an OfflineAudioContext at the target
 * rate/channels → re-encoded to AAC. Even with nothing to mix, we
 * still pass through the offline context so source-rate-mismatch
 * (e.g. 44.1k input, 48k output) is handled.
 *
 * Mix mode (bgUrl + bgVolume): the bg track is decoded the same way,
 * then looped via AudioBufferSourceNode.loop = true to span the full
 * output duration. Talking head plays once at gain 1.0; bg plays
 * looped at gain `bgVolume`. Both feed a single destination on an
 * OfflineAudioContext of length `durationSec * sampleRate`.
 *
 * Both modes end at exactly `durationSec` — the offline context is
 * rendered with that length, so the encoder gets exactly the right
 * number of samples.
 *
 * @param {Object} opts
 * @param {string} opts.talkingHeadUrl
 * @param {string} [opts.bgUrl]
 * @param {number} [opts.bgVolume=0]
 * @param {number} opts.durationSec
 * @param {number} [opts.sampleRate=48000]
 * @param {number} [opts.channels=2]
 * @param {AbortSignal} [opts.signal]
 * @param {(p:{secondsEncoded:number,total:number})=>void} [opts.onProgress]
 * @returns {AsyncGenerator<{chunk: EncodedAudioChunk, meta: any}>}
 */
export async function* encodeAudioStream(opts) {
  const {
    talkingHeadUrl,
    bgUrl,
    bgVolume = 0,
    durationSec,
    sampleRate = 48000,
    channels = 2,
    signal,
    onProgress,
  } = opts;

  if (typeof AudioDecoder === "undefined" || typeof AudioEncoder === "undefined") {
    throw new Error("WebCodecs audio is not available in this browser");
  }
  if (!talkingHeadUrl) throw new Error("encodeAudioStream: talkingHeadUrl required");
  if (!(durationSec > 0)) throw new Error("encodeAudioStream: durationSec must be > 0");

  // ----- 1. Decode both sources into AudioBuffers (in their native rates).
  const head = await loadAudioAsBuffer(talkingHeadUrl, { sampleRate, channels, signal });
  if (!head) throw new Error("talking head mp4 has no audio track");

  let bg = null;
  if (bgUrl && bgVolume > 0) {
    bg = await loadAudioAsBuffer(bgUrl, { sampleRate, channels, signal });
    // If the bg has no audio track or fails to decode, fall back to
    // passthrough silently rather than blowing up the export.
    if (!bg) {
      // eslint-disable-next-line no-console
      console.warn("[audioBridge] bg url has no audio track — falling back to passthrough");
    }
  }

  // ----- 2. Render through an OfflineAudioContext (handles resampling
  // and looping). Length is locked to durationSec at the target rate.
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  const totalFrames = Math.round(durationSec * sampleRate);
  const offline = new OfflineAudioContext({
    numberOfChannels: channels,
    length: totalFrames,
    sampleRate,
  });

  // Talking head: plays once from t=0. Even in passthrough mode this
  // gives us free resampling + channel layout conversion.
  const headSrc = offline.createBufferSource();
  headSrc.buffer = head.buffer;
  headSrc.loop = false;
  const headGain = offline.createGain();
  headGain.gain.value = 1.0;
  headSrc.connect(headGain).connect(offline.destination);
  headSrc.start(0);

  // Bg: looped from t=0 across the full duration, attenuated by
  // bgVolume. The Web Audio loop primitive (`source.loop = true`) is
  // sample-accurate — when playback reaches the end of buffer.duration
  // it restarts at loopStart (default 0). This correctly handles bg
  // shorter than durationSec by repeating, AND bg longer than
  // durationSec by simply cutting off when offline.length is reached.
  if (bg) {
    const bgSrc = offline.createBufferSource();
    bgSrc.buffer = bg.buffer;
    bgSrc.loop = true;
    const bgGainNode = offline.createGain();
    bgGainNode.gain.value = Math.max(0, Math.min(1, bgVolume));
    bgSrc.connect(bgGainNode).connect(offline.destination);
    bgSrc.start(0);
  }

  const mixed = await offline.startRendering();

  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  // ----- 3. Encode the rendered buffer as AAC.
  const encoderConfig = await pickAacEncoderConfig({ sampleRate, channels });

  /** @type {Array<{chunk: EncodedAudioChunk, meta: any}>} */
  const outQueue = [];
  /** @type {Error|null} */
  let encoderError = null;
  let wake = null;
  const signalChange = () => { if (wake) { wake(); wake = null; } };

  const encoder = new AudioEncoder({
    output: (chunk, meta) => { outQueue.push({ chunk, meta }); signalChange(); },
    error: (e) => { encoderError = e instanceof Error ? e : new Error(String(e)); signalChange(); },
  });
  encoder.configure(encoderConfig);

  // AAC's natural frame size is 1024 PCM samples per channel. Feeding
  // the encoder in that granularity gives one EncodedAudioChunk per
  // call, with timestamps that line up to the AAC frame boundaries.
  // It's also what every reference muxer expects.
  const FRAME = 1024;
  const totalLen = mixed.length;

  // Pull each channel out once; we'll interleave per frame.
  const channelData = [];
  for (let c = 0; c < channels; c++) channelData.push(mixed.getChannelData(c));

  let framesSubmitted = 0;
  let chunkCount = 0;

  try {
    for (let offset = 0; offset < totalLen; offset += FRAME) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      if (encoderError) throw encoderError;

      const n = Math.min(FRAME, totalLen - offset);

      // Build a planar Float32 buffer: channel 0 samples then channel 1.
      const planar = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) {
        planar.set(channelData[c].subarray(offset, offset + n), c * n);
      }

      // Timestamp in microseconds from the start of the output
      // timeline. Truncation matters less than monotonicity here —
      // computing from `offset` rather than accumulating prevents
      // drift over long durations.
      const timestamp = Math.round((offset * 1_000_000) / sampleRate);

      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp,
        data: planar,
      });

      encoder.encode(audioData);
      audioData.close();
      framesSubmitted++;

      // Backpressure — let the encoder catch up if queue grows.
      if (encoder.encodeQueueSize > 16) {
        // Yield to the event loop. The encoder makes progress on the
        // microtask boundary.
        await new Promise((r) => setTimeout(r, 0));
      }

      // Drain any chunks the encoder has emitted so far.
      while (outQueue.length) {
        const item = outQueue.shift();
        chunkCount++;
        onProgress?.({
          secondsEncoded: item.chunk.timestamp / 1_000_000,
          total: durationSec,
        });
        yield item;
      }
    }

    await encoder.flush();
    while (outQueue.length) {
      const item = outQueue.shift();
      chunkCount++;
      onProgress?.({
        secondsEncoded: item.chunk.timestamp / 1_000_000,
        total: durationSec,
      });
      yield item;
    }

    if (encoderError) throw encoderError;
  } finally {
    try { encoder.close(); } catch {}
  }

  void framesSubmitted;
  void chunkCount;
}

// ---------------------------------------------------------------------------
// Dev-only self test
// ---------------------------------------------------------------------------

/**
 * Sanity-check the module against a known-good mp4 URL. Call from the
 * browser console:
 *
 *   import("./lib/audioBridge.js").then(m => m.__runSelfTest("/bg.mp4"))
 *
 * Logs:
 *   * Probed metadata
 *   * Whether AudioEncoder configured cleanly + which config shape won
 *   * The AudioDecoderConfig description bytes (hex)
 *   * First 5 encoded chunks' timestamps + byte lengths
 */
export async function __runSelfTest(url, { maxChunks = 5, durationSec = 3 } = {}) {
  console.group(`[audioBridge selfTest] ${url}`);
  try {
    const meta = await probeAudioMetadata(url);
    console.log("probe:", meta);
    if (!meta) {
      console.warn("no audio track — nothing to test");
      return { ok: false, reason: "no audio track" };
    }

    // Show the AAC description bytes for the source. This is the most
    // common silent-failure point; eyeballing them against the
    // ISO/IEC 14496-3 AudioSpecificConfig table tells you whether
    // demux extracted the right slice.
    const buf = await fetchMp4(url);
    const { file, info } = await parseWithMp4Box(buf);
    const at = info.audioTracks?.[0];
    const trakBox = file.getTrackById(at.id);
    const desc = extractAacDescription(trakBox);
    const hex = Array.from(desc).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    console.log(`AudioSpecificConfig (${desc.length} bytes): ${hex}`);

    // Test encoder config picking.
    let encConfig;
    try {
      encConfig = await pickAacEncoderConfig({ sampleRate: 48000, channels: 2 });
      console.log("encoder config OK:", encConfig);
    } catch (e) {
      console.error("encoder config FAILED:", e);
      return { ok: false, error: e };
    }

    // Run a short encode (passthrough mode) and print first chunks.
    const chunks = [];
    let i = 0;
    const dur = Math.min(durationSec, meta.duration || durationSec);
    for await (const item of encodeAudioStream({
      talkingHeadUrl: url,
      durationSec: dur,
      sampleRate: 48000,
      channels: 2,
    })) {
      if (i < maxChunks) {
        console.log(`chunk ${i}: ts=${item.chunk.timestamp}us bytes=${item.chunk.byteLength} type=${item.chunk.type}`);
        chunks.push({
          ts: item.chunk.timestamp,
          bytes: item.chunk.byteLength,
          type: item.chunk.type,
        });
      }
      i++;
    }
    console.log(`selfTest OK: encoded ${i} chunks total`);
    return { ok: true, chunks, meta, descriptionHex: hex, encConfig };
  } catch (e) {
    console.error("selfTest FAILED:", e);
    return { ok: false, error: e };
  } finally {
    console.groupEnd();
  }
}
