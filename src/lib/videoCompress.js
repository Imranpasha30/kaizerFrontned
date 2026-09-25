/**
 * videoCompress.js — 100% in-browser video compression (WebCodecs).
 *
 * The file NEVER leaves the user's device: mp4box.js parses the mp4
 * index locally, VideoDecoder/VideoEncoder run on the machine's own
 * hardware codecs, mp4-muxer writes the new MP4 in memory. Audio is
 * COPIED bit-for-bit (zero audio loss); video is re-encoded at a
 * visually-lossless bitrate chosen from resolution/fps and capped well
 * below the source bitrate — on typical camera/news footage that lands
 * 85-95% smaller. The achieved number is always reported honestly (an
 * already-tiny source cannot be shrunk 85% again without visible damage).
 *
 * STREAMING + MEMORY-BOUNDED: a Chrome tab dies around ~4GB no matter
 * how much RAM the machine has, so nothing here may scale with file
 * size. mp4box is used ONLY for metadata — it is fed the header boxes
 * and the moov (index), never the media data. (Its own extraction path
 * copies the ENTIRE mdat into a side stream the moment the mdat's end
 * is reachable — transferMdatData — which is an inherent whole-file
 * buffer for the moov-at-end layout every phone/camera writes, and the
 * reason the first version OOM-crashed the tab.) Sample bytes are read
 * directly from the File via slice() in coalesced ~8MB runs, and the
 * compressed-frame queue, decoder queue and encoder queue are all
 * capped, applying backpressure back to the file reads. Only the OUTPUT
 * (~12% of the source) is held in memory.
 *
 * Chrome/Edge only (WebCodecs). No SharedArrayBuffer / COOP headers
 * needed (unlike ffmpeg.wasm), and no 2GB WASM memory ceiling.
 */
// mp4box v2 ships named ESM exports only (no default) — namespace-import it.
import * as MP4Box from "mp4box";
import { Muxer, StreamTarget } from "mp4-muxer";

export function isSupported() {
  return typeof window !== "undefined"
    && "VideoEncoder" in window && "VideoDecoder" in window;
}

/* ── tuning ──────────────────────────────────────────────────────── */

const RUN_BYTES = 8 * 1024 * 1024;  // coalesced sample-read size
const RUN_GAP = 1024 * 1024;        // don't bridge dead zones bigger than this
const VQ_MAX = 400;                 // compressed frames waiting for the decoder
const DEC_Q = 14;                   // decoder in-flight cap
const ENC_Q = 12;                   // encoder in-flight cap (decoded frames are big)
const SKIP_BOX_BYTES = 64 * 1024 * 1024; // non-moov header box bigger than this: skip
const STALL_MS = 120000;            // no forward progress for 2min = give up
const INDEX_MS = 120000;            // reading the index may never hang the page
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Breadcrumbs for field debugging (visible in devtools; harmless in prod).
const dbg = (...a) => { try { console.debug("KZC", ...a); } catch { /* noop */ } };

// Every file read gets its own watchdog. A File.slice().arrayBuffer()
// that never resolves (seen in the field: security extensions / antivirus
// hooking browser file access) must become a clear, actionable error —
// never a silently stuck progress bar.
const READ_TIMEOUT_MS = 20000;
function readSlice(file, start, end, what) {
  return Promise.race([
    file.slice(start, end).arrayBuffer(),
    sleep(READ_TIMEOUT_MS).then(() => {
      throw new Error(
        `Chrome could not read ${what} (the read hung for ${READ_TIMEOUT_MS / 1000}s). `
        + "This is usually an antivirus or a browser extension blocking file access — "
        + "try an Incognito window (Ctrl+Shift+N), or temporarily disable extensions, "
        + "and make sure the drive isn't busy.");
    }),
  ]);
}

/* ── helpers ─────────────────────────────────────────────────────── */

// Codec-private description (avcC / hvcC) the decoder needs, pulled from
// the mp4 sample description box. Standard mp4box.js extraction pattern.
function videoDescription(mp4file, trackId) {
  const trak = mp4file.getTrackById(trackId);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const DataStream = MP4Box.DataStream;
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8); // strip the box header
    }
  }
  return undefined;
}

// AAC AudioSpecificConfig for bit-exact audio passthrough into the muxer.
function audioSpecificConfig(mp4file, trackId) {
  try {
    const trak = mp4file.getTrackById(trackId);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const esds = entry.esds;
      const d = esds && esds.esd && esds.esd.descs && esds.esd.descs[0];
      const dsi = d && d.descs && d.descs[0];
      if (dsi && dsi.data) return new Uint8Array(dsi.data);
    }
  } catch { /* fall through */ }
  return undefined;
}

// Visually-lossless-leaning H.264 target bitrate: resolution/fps cap,
// pulled DOWN by the source bitrate (never spend more than ~15% of the
// original; never starve below 1.2 Mbps).
function pickBitrate(w, h, fps, sourceBps) {
  const p = Math.min(w, h);
  const cap = p >= 2000 ? 14e6 : p >= 1300 ? 8e6 : p >= 1000 ? 5.2e6
    : p >= 700 ? 3.2e6 : 1.6e6;
  const fpsScale = fps > 40 ? 1.45 : 1.0;
  let target = cap * fpsScale;
  // 12% of the source bitrate: lands ~88% size reduction on typical
  // high-bitrate camera footage while staying visually transparent for
  // news content; the 1.2 Mbps floor protects already-lean sources.
  if (sourceBps > 0) target = Math.min(target, Math.max(sourceBps * 0.12, 1.2e6));
  return Math.round(target);
}

function avcCodecString(w, h) {
  // High profile; level by picture size (5.1 covers 4K30).
  return Math.max(w, h) > 1920 ? "avc1.640033" : "avc1.640028";
}

// Walk the TOP-LEVEL mp4 boxes reading only 16-byte headers — locates
// every box (ftyp, mdat, moov, …) without touching the media data.
// Handles 64-bit largesize boxes (any file over 4GB uses one).
async function walkTopBoxes(file, onHop) {
  const boxes = [];
  let pos = 0, hops = 0;
  while (pos + 8 <= file.size && hops++ < 8192) {
    if (onHop) onHop(pos, hops);
    const hdr = new DataView(
      await readSlice(file, pos, Math.min(pos + 16, file.size),
        `the file structure (box ${hops} at byte ${pos})`));
    if (hdr.byteLength < 8) break;
    let size = hdr.getUint32(0);
    const type = String.fromCharCode(
      hdr.getUint8(4), hdr.getUint8(5), hdr.getUint8(6), hdr.getUint8(7));
    if (size === 1) {
      if (hdr.byteLength < 16) break;
      size = Number(hdr.getBigUint64(8));
    } else if (size === 0) {
      size = file.size - pos; // box runs to end-of-file
    }
    if (!isFinite(size) || size < 8) break; // corrupt header — bail out
    boxes.push({ start: pos, end: Math.min(pos + size, file.size), type });
    pos += size;
  }
  return boxes;
}

// Sony/camera files carry raw PCM audio ('twos'/'sowt'): 48,000 index
// entries PER SECOND (84.5M for a half-hour clip). mp4box expands every
// entry into a JS object — several GB → frozen page → tab OOM. So the
// moov is sanitized BEFORE mp4box sees it: pathological non-video tracks
// are patched to 'free' (4-byte type overwrite, mp4box skips them), and
// for 16-bit PCM audio the chunk map (a few thousand entries, not
// millions) is extracted here so the audio can be transcoded to AAC.
function sanitizeMoov(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const rd32 = (p) => dv.getUint32(p);
  const type4 = (p) => String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
  const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);
  const traks = [];
  let cur = null;
  const walk = (start, end) => {
    let pos = start;
    while (pos + 8 <= end) {
      let size = rd32(pos);
      const btype = type4(pos + 4);
      let hdr = 8;
      if (size === 1) { size = Number(dv.getBigUint64(pos + 8)); hdr = 16; }
      else if (size === 0) size = end - pos;
      if (size < hdr || pos + size > end) break;
      const bs = pos + hdr, be = pos + size;
      if (btype === "trak") { cur = { hdrPos: pos, stsc: [], offsets: [] }; traks.push(cur); }
      else if (cur) {
        if (btype === "mdhd") {
          const ver = u8[bs];
          cur.timescale = ver === 0 ? rd32(bs + 12) : rd32(bs + 20);
        } else if (btype === "hdlr") cur.handler = type4(bs + 8);
        else if (btype === "stsd") cur.format = type4(bs + 12);
        else if (btype === "stsz") { cur.sampleSize = rd32(bs + 4); cur.sampleCount = rd32(bs + 8); }
        else if (btype === "stsc") {
          const n = rd32(bs + 4);
          for (let i = 0; i < n; i++) {
            cur.stsc.push({
              firstChunk: rd32(bs + 8 + i * 12),
              perChunk: rd32(bs + 12 + i * 12),
            });
          }
        } else if (btype === "stco") {
          const n = rd32(bs + 4);
          for (let i = 0; i < n; i++) cur.offsets.push(rd32(bs + 8 + i * 4));
        } else if (btype === "co64") {
          const n = rd32(bs + 4);
          for (let i = 0; i < n; i++) cur.offsets.push(Number(dv.getBigUint64(bs + 8 + i * 8)));
        }
        if (cur.handler === "soun" && btype === "stsd"
            && ["twos", "sowt", "lpcm", "ipcm", "raw "].includes(cur.format)) {
          // SoundSampleEntry: channels @ body+24, bits @ +26, rate @ +32 (16.16)
          cur.pcm = {
            bigEndian: cur.format !== "sowt",
            channels: dv.getUint16(bs + 8 + 16 + 8),
            bits: dv.getUint16(bs + 8 + 16 + 10),
            rate: rd32(bs + 8 + 16 + 16) >>> 16,
          };
        }
      }
      if (CONTAINERS.has(btype)) walk(bs, be);
      pos += size;
    }
  };
  walk(0, u8.byteLength);

  let pcm = null;
  for (const t of traks) {
    const pathological = (t.sampleCount || 0) > 2_000_000;
    const isVideo = t.handler === "vide";
    if (isVideo) continue;
    if (t.handler === "soun" && t.pcm && t.pcm.bits === 16 && t.sampleSize > 0 && t.offsets.length) {
      // Build the chunk map (thousands of entries) for the AAC transcode.
      const chunks = [];
      const nChunks = t.offsets.length;
      let frames = 0;
      for (let c = 0; c < nChunks; c++) {
        let per = t.stsc.length ? t.stsc[0].perChunk : 0;
        for (const e of t.stsc) { if (e.firstChunk <= c + 1) per = e.perChunk; else break; }
        chunks.push({ offset: t.offsets[c], bytes: per * t.sampleSize, frames: per, tsFrames: frames });
        frames += per;
      }
      pcm = {
        ...t.pcm, timescale: t.timescale || t.pcm.rate,
        bytesPerFrame: t.sampleSize, chunks, totalFrames: frames,
      };
    }
    if (t.handler !== "soun" || t.pcm || pathological) {
      // Hide from mp4box: PCM/meta/pathological tracks would explode its
      // per-sample tables. 'free' boxes are skipped entirely.
      u8[t.hdrPos + 4] = 0x66; u8[t.hdrPos + 5] = 0x72; // 'f' 'r'
      u8[t.hdrPos + 6] = 0x65; u8[t.hdrPos + 7] = 0x65; // 'e' 'e'
      dbg("sanitizeMoov: hid track", t.handler, t.format, t.sampleCount, "samples");
    }
  }
  return pcm;
}

/* ── the compressor ──────────────────────────────────────────────── */

/**
 * compress(file, { onProgress }) -> { blob, stats }
 * onProgress({ stage, pct, note }) — stage: read | prepare | compress | finish
 * Throws Error with a human message on unsupported input/browser.
 */
export async function compress(file, { onProgress = () => {} } = {}) {
  if (!isSupported()) {
    throw new Error("This browser can't compress locally — use Chrome or Edge.");
  }

  let fatal = null;
  const fail = (e) => { if (!fatal) fatal = e instanceof Error ? e : new Error(String(e)); };
  let lastActivity = Date.now();
  const alive = () => { lastActivity = Date.now(); };
  const stalled = () => Date.now() - lastActivity > STALL_MS;

  /* ── phase A: parse ONLY the index. The header boxes and the moov are
     fed to mp4box as a synthetic contiguous stream (mdat elided), so it
     never sees a media byte no matter where the moov sits or how big
     the file is. Sample OFFSETS in the parsed tables are absolute file
     positions (stco/co64), which is what the run reader needs. Raced
     against a hard timeout — reading the index must NEVER hang the
     page; a slow/corrupt file becomes a clear error instead. ── */
  let indexStep = "starting";
  const readIndex = async () => {
    onProgress({ stage: "read", pct: 5, note: "Scanning the file structure" });
    const boxes = await walkTopBoxes(file, (pos, n) => {
      indexStep = `scanning file structure (box ${n}, byte ${pos})`;
      onProgress({ stage: "read", pct: Math.min(9, 5 + n), note: `Scanning the file structure (box ${n})` });
    });
    dbg("boxes:", boxes.map((b) => `${b.type}@${b.start}+${b.end - b.start}`).join(" "));
    const moovBox = boxes.find((b) => b.type === "moov");
    if (!moovBox) {
      throw new Error("Could not find this file's MP4 index — use a standard (non-fragmented) MP4/MOV.");
    }
    if (moovBox.end - moovBox.start > 256 * 1024 * 1024) {
      throw new Error("This file's index is implausibly large — the file looks corrupt.");
    }

    const mp4file = MP4Box.createFile();
    let info = null, parseErr = null, pcmInfo = null;
    mp4file.onError = (e) => { parseErr = new Error("Could not read this video (" + e + "). Use an MP4 file."); };
    mp4file.onReady = (i) => { info = i; };
    let cursor = 0;
    let fed = 0;
    const feedable = boxes.filter((b) =>
      b.type !== "mdat" && (b.type === "moov" || b.end - b.start <= SKIP_BOX_BYTES));
    for (const b of feedable) {
      onProgress({
        stage: "read",
        pct: 10 + Math.round((fed / Math.max(1, feedable.length)) * 60),
        note: "Reading the video index",
      });
      dbg("feeding box", b.type, b.end - b.start);
      indexStep = `reading the ${b.type} box (${b.end - b.start} bytes)`;
      const buf = await readSlice(file, b.start, b.end, `the ${b.type} box`);
      if (b.type === "moov") {
        indexStep = "sanitizing the index";
        pcmInfo = sanitizeMoov(new Uint8Array(buf));
        if (pcmInfo) dbg("pcm audio:", pcmInfo.rate, "Hz x", pcmInfo.channels, "ch,", pcmInfo.chunks.length, "chunks");
      }
      buf.fileStart = cursor;          // synthetic contiguous layout
      cursor += buf.byteLength;
      mp4file.appendBuffer(buf);
      fed++;
      await sleep(0);                  // let the page paint between boxes
      if (parseErr || info) break;     // moov parsed (or died) — done
      if (b.type === "moov") break;
    }
    dbg("index fed, flushing");
    mp4file.flush(); // finalize sample tables (extraction is never started)
    if (parseErr) throw parseErr;
    if (!info) throw new Error("Could not parse this video's MP4 index. Use a standard MP4 file.");
    const vTrack = (info.videoTracks || [])[0] || null;
    const aTrack = (info.audioTracks || [])[0] || null;
    if (!vTrack) throw new Error("No video track found in this file.");
    onProgress({ stage: "read", pct: 85, note: "Building the sample map" });
    indexStep = "building the sample map";
    await sleep(0);
    const vSamples = mp4file.getTrackSamplesInfo(vTrack.id) || [];
    const aSamples = aTrack ? (mp4file.getTrackSamplesInfo(aTrack.id) || []) : [];
    dbg("tables:", vSamples.length, "video +", aSamples.length, "audio samples");
    if (!vSamples.length) {
      throw new Error("This looks like a fragmented/streaming MP4, which isn't supported yet — re-export it as a standard MP4.");
    }
    return { mp4file, info, vTrack, aTrack, vSamples, aSamples, pcmInfo };
  };
  const indexTimeout = sleep(INDEX_MS).then(() => {
    throw new Error(
      "Reading this file's video index took too long (stuck at: " + indexStep + "). "
      + "If the video lives on OneDrive/Google Drive or an SD card, copy it to the local disk and try again.");
  });
  const { mp4file, info, vTrack, aTrack, vSamples, aSamples, pcmInfo } =
    await Promise.race([readIndex(), indexTimeout]);
  alive();

  /* ── geometry + rates ── */
  const W = vTrack.video ? vTrack.video.width : vTrack.track_width;
  const H = vTrack.video ? vTrack.video.height : vTrack.track_height;
  const durS = (info.duration || vTrack.duration) / (info.timescale || vTrack.timescale) || 1;
  const vTotal = vSamples.length;
  const fps = Math.min(120, Math.max(10, vTotal / durS));
  const srcBps = (file.size * 8) / durS;
  const bitrate = pickBitrate(W, H, fps, srcBps);
  dbg("geometry", W, "x", H, "fps", fps, "dur", durS, "target bps", bitrate);
  onProgress({ stage: "prepare", pct: 100, note: `Target ${(bitrate / 1e6).toFixed(1)} Mbps H.264` });

  /* encoder support check (hardware first, software fallback is automatic
     with no-preference) */
  const encCfg = {
    codec: avcCodecString(W, H),
    width: W - (W % 2), height: H - (H % 2),
    bitrate, framerate: Math.round(fps),
    latencyMode: "quality",
    hardwareAcceleration: "no-preference",
    avc: { format: "avc" },
  };
  const sup = await VideoEncoder.isConfigSupported(encCfg);
  if (!sup.supported) throw new Error("This machine's browser can't encode H.264 locally.");

  // Many files start their presentation timeline late (edit-list /
  // B-frame offset); the muxer requires each track's first chunk at t=0.
  // One COMMON offset is subtracted from video AND audio so A/V sync is
  // preserved exactly. The full sample table is in hand — take the true
  // minimum.
  const vScale = 1e6 / vTrack.timescale;
  let presStartUs = Infinity;
  for (const s of vSamples) presStartUs = Math.min(presStartUs, Math.round(s.cts * vScale));
  if (!isFinite(presStartUs)) presStartUs = 0;

  /* muxer — audio passthrough when we can hand it the AAC config.
     fastStart OFF: 'in-memory' retains every chunk until finalize; with
     the moov simply written at the end, output bytes stream straight
     into the target buffer instead. (Irrelevant for a local download.) */
  const asc = aTrack ? audioSpecificConfig(mp4file, aTrack.id) : undefined;
  const audioPassthrough = !!(aTrack && /mp4a/i.test(aTrack.codec || "") && asc);

  // Camera PCM audio → AAC 256k (perceptually transparent; raw PCM can't
  // be muxed into a browser MP4, and its index is what OOM'd the tab).
  let audioMode = audioPassthrough ? "copied" : "none";
  let pcmCfg = null;
  if (pcmInfo && !audioPassthrough && typeof AudioEncoder !== "undefined") {
    // Platform AAC encoders accept only specific bitrates (Windows MF
    // tops out at 192k stereo) — walk the ladder to the best supported.
    for (const kbps of [256, 192, 160, 128, 96]) {
      const cfg = {
        codec: "mp4a.40.2",
        sampleRate: pcmInfo.rate || 48000,
        numberOfChannels: pcmInfo.channels || 2,
        bitrate: kbps * 1000,
      };
      try {
        const s = await AudioEncoder.isConfigSupported(cfg);
        if (s.supported) { pcmCfg = cfg; audioMode = "transcoded"; break; }
      } catch { /* try the next rung */ }
    }
    dbg("pcm->aac:", audioMode === "transcoded" ? pcmCfg.bitrate + " bps" : "no supported AAC config");
  }
  // Output: chunked StreamTarget + progressive Blob accumulation. A Blob
  // built as new Blob([prevBlob, chunk]) REFERENCES the previous blob's
  // storage (no recopy), and Chrome pages blob storage to disk — so the
  // finished MP4 (>1GB for a multi-GB source) never sits in the JS heap
  // the way ArrayBufferTarget's single growing buffer (+ final copy) does.
  let outBlob = new Blob([], { type: "video/mp4" });
  let outPos = 0;
  const patches = []; // out-of-order rewrites (e.g. the mdat size patch at finalize)
  const target = new StreamTarget({
    chunked: true,
    chunkSize: 8 * 1024 * 1024,
    onData: (data, position) => {
      if (position === outPos) {
        outBlob = new Blob([outBlob, data], { type: "video/mp4" });
        outPos += data.byteLength;
      } else if (position > outPos) {
        outBlob = new Blob([outBlob, new Uint8Array(position - outPos), data], { type: "video/mp4" });
        outPos = position + data.byteLength;
      } else {
        patches.push({ position, data: data.slice() });
      }
    },
  });
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: encCfg.width, height: encCfg.height },
    ...(audioPassthrough ? {
      audio: {
        codec: "aac",
        numberOfChannels: aTrack.audio ? aTrack.audio.channel_count : 2,
        sampleRate: aTrack.audio ? aTrack.audio.sample_rate : 48000,
      },
    } : audioMode === "transcoded" ? {
      audio: {
        codec: "aac",
        numberOfChannels: pcmCfg.numberOfChannels,
        sampleRate: pcmCfg.sampleRate,
      },
    } : {}),
    fastStart: false,
  });

  let pcmEncoder = null;
  if (audioMode === "transcoded") {
    pcmEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        try { muxer.addAudioChunk(chunk, meta); alive(); } catch (e) { fail(e); }
      },
      error: (e) => fail(e),
    });
    pcmEncoder.configure(pcmCfg);
  }

  const aScaleDefault = aTrack ? 1e6 / aTrack.timescale : 0;
  let firstAudio = true;
  const muxAudioSample = (s, data) => {
    // audio: bit-exact copy of the original AAC (zero quality loss)
    const sc = s.timescale ? 1e6 / s.timescale : aScaleDefault;
    muxer.addAudioChunkRaw(
      new Uint8Array(data), s.is_sync === false ? "delta" : "key",
      Math.max(0, Math.round(s.cts * sc) - presStartUs),
      Math.round(s.duration * sc),
      firstAudio ? { decoderConfig: { description: asc } } : undefined,
    );
    firstAudio = false;
  };

  /* video pipeline: decode -> encode -> mux, all queues capped */
  const keyEvery = Math.max(1, Math.round(fps * 2));   // keyframe ~every 2s
  let decoded = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        // The browser encoder can report an UNDEFINED/reserved transfer
        // characteristic; the muxer then writes colr with trc=reserved
        // and ffmpeg's swscaler refuses the file (Error -129, jobs
        // 601/602). Force a fully valid bt709 tag — correct for every
        // SDR camera/phone source this tool targets.
        if (meta && meta.decoderConfig) {
          // ONLY the transfers mp4-muxer can serialize (its
          // TRANSFER_CHARACTERISTICS_MAP keys). linear/pq/hlg are NOT in the
          // map — leaving them here let the muxer write trc=0 (reserved), the
          // exact tag that forced a slow re-encode normalize downstream. Any
          // other transfer now trips the rewrite below → a valid bt709 tag.
          const okT = ["bt709", "smpte170m", "iec61966-2-1"];
          const cs = meta.decoderConfig.colorSpace;
          if (!cs || !okT.includes(cs.transfer)) {
            meta.decoderConfig.colorSpace = {
              primaries: (cs && cs.primaries) || "bt709",
              transfer: "bt709",
              matrix: (cs && cs.matrix) || "bt709",
              fullRange: !!(cs && cs.fullRange),
            };
          }
        }
        muxer.addVideoChunk(chunk, meta);
        alive();
      } catch (e) { fail(e); }
    },
    error: (e) => fail(e),
  });
  encoder.configure(encCfg);

  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        const shifted = new VideoFrame(frame, {
          timestamp: Math.max(0, frame.timestamp - presStartUs),
        });
        encoder.encode(shifted, { keyFrame: decoded % keyEvery === 0 });
        shifted.close();
        decoded += 1;
        alive();
        if (decoded % 10 === 0 || decoded === vTotal) {
          onProgress({
            stage: "compress",
            pct: Math.min(99, Math.round((decoded / vTotal) * 100)),
            note: `${decoded}/${vTotal} frames`,
          });
        }
      } catch (e) { fail(e); } finally { frame.close(); }
    },
    error: (e) => fail(e),
  });
  decoder.configure({
    codec: vTrack.codec,
    codedWidth: W, codedHeight: H,
    description: videoDescription(mp4file, vTrack.id),
    hardwareAcceleration: "no-preference",
  });

  // Compressed frames waiting for the decoder — bounded by VQ_MAX
  // (EncodedVideoChunk copies the bytes, so run buffers can be dropped).
  const vQueue = [];
  let demuxDone = false;
  const feeder = (async () => {
    for (;;) {
      if (fatal) return;
      if (vQueue.length === 0) {
        if (demuxDone) return;
        if (stalled()) { fail(new Error("Compression stalled — this file may use an unsupported codec.")); return; }
        await sleep(10); continue;
      }
      if (decoder.decodeQueueSize > DEC_Q || encoder.encodeQueueSize > ENC_Q) {
        if (stalled()) { fail(new Error("Compression stalled mid-stream.")); return; }
        await sleep(12); continue;
      }
      try { decoder.decode(vQueue.shift()); } catch (e) { fail(e); return; }
    }
  })();

  /* ── phase B: read sample bytes straight from the File, in coalesced
     runs, in file order (sequential I/O on interleaved mp4s) ── */
  const plan = [];
  for (const s of vSamples) if (s.size > 0) plan.push({ kind: "v", offset: s.offset, size: s.size, s });
  if (audioPassthrough) for (const s of aSamples) if (s.size > 0) plan.push({ kind: "a", offset: s.offset, size: s.size, s });
  if (audioMode === "transcoded") for (const c of pcmInfo.chunks) if (c.bytes > 0) plan.push({ kind: "p", offset: c.offset, size: c.bytes, c });
  plan.sort((x, y) => x.offset - y.offset);
  dbg("plan:", plan.length, "entries, audio:", audioMode);

  try {
    let i = 0;
    let runs = 0;
    while (i < plan.length && !fatal) {
      // backpressure: the file reads wait on the compressed-frame queue
      // (and the audio encoder, when PCM is being transcoded)
      while (!fatal && (vQueue.length > VQ_MAX
        || (pcmEncoder && pcmEncoder.encodeQueueSize > 60))) {
        if (stalled()) { fail(new Error("Compression stalled — this file may use an unsupported codec.")); break; }
        await sleep(12);
      }
      if (fatal) break;
      // coalesce a run of nearby entries (always ≥1 whole entry)
      const runStart = plan[i].offset;
      let runEnd = plan[i].offset + plan[i].size;
      let j = i + 1;
      while (j < plan.length) {
        const n = plan[j];
        if (n.offset - runEnd > RUN_GAP) break;
        if (n.offset + n.size - runStart > RUN_BYTES) break;
        runEnd = Math.max(runEnd, n.offset + n.size);
        j++;
      }
      const buf = await readSlice(file, runStart, runEnd, "media data");
      alive();
      if (runs === 0) dbg("first run read", runStart, "-", runEnd);
      runs++;
      for (; i < j; i++) {
        const e = plan[i];
        const data = new Uint8Array(buf, e.offset - runStart, e.size);
        if (e.kind === "v") {
          const s = e.s;
          vQueue.push(new EncodedVideoChunk({
            type: s.is_sync ? "key" : "delta",
            timestamp: Math.round(s.cts * vScale),
            duration: Math.round(s.duration * vScale),
            data,
          }));
        } else if (e.kind === "a") {
          try { muxAudioSample(e.s, data); } catch (err) { fail(err); }
        } else {
          // PCM block → interleaved s16 AudioData → AAC. 'twos' is
          // big-endian: swap byte pairs (AudioData expects native LE).
          try {
            const copy = new Uint8Array(data);
            if (pcmInfo.bigEndian) {
              for (let k = 0; k + 1 < copy.length; k += 2) {
                const t = copy[k]; copy[k] = copy[k + 1]; copy[k + 1] = t;
              }
            }
            const ts = Math.max(0,
              Math.round(e.c.tsFrames * 1e6 / pcmCfg.sampleRate) - presStartUs);
            const ad = new AudioData({
              format: "s16", sampleRate: pcmCfg.sampleRate,
              numberOfFrames: e.c.frames, numberOfChannels: pcmCfg.numberOfChannels,
              timestamp: ts, data: copy,
            });
            pcmEncoder.encode(ad);
            ad.close();
          } catch (err) { fail(err); }
        }
      }
    }
    dbg("phase B done:", runs, "runs");
  } catch (e) { fail(e); }
  demuxDone = true;
  await feeder;

  if (!fatal) {
    try {
      onProgress({ stage: "finish", pct: 99, note: "Flushing encoders" });
      await decoder.flush();
      await encoder.flush();
      if (pcmEncoder) await pcmEncoder.flush();
    } catch (e) { fail(e); }
  }
  try { decoder.close(); } catch { /* already closed */ }
  try { encoder.close(); } catch { /* already closed */ }
  try { if (pcmEncoder) pcmEncoder.close(); } catch { /* already closed */ }
  if (fatal) throw new Error("Compression failed mid-stream: " + (fatal.message || fatal));

  onProgress({ stage: "finish", pct: 100, note: "Writing MP4" });
  muxer.finalize();
  // Apply the deferred in-place rewrites by zero-copy blob splicing.
  for (const p of patches) {
    outBlob = new Blob([
      outBlob.slice(0, p.position),
      p.data,
      outBlob.slice(Math.min(p.position + p.data.byteLength, outBlob.size)),
    ], { type: "video/mp4" });
  }
  const blob = outBlob;
  const reduction = Math.max(0, Math.round((1 - blob.size / file.size) * 1000) / 10);
  return {
    blob,
    stats: {
      inBytes: file.size, outBytes: blob.size, reductionPct: reduction,
      width: W, height: H, fps: Math.round(fps), durationS: Math.round(durS),
      bitrateMbps: Math.round((bitrate / 1e6) * 10) / 10,
      audioCopied: audioPassthrough,
      audioMode,
    },
  };
}
