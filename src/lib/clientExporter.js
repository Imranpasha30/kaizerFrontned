// Phase C: in-browser bulletin exporter.
//
// Produces a playable mp4 entirely client-side. The server's
// `v1_bridge.render_bulletin` ffmpeg pipeline is replicated here in
// JavaScript using WebCodecs + Canvas2D + mp4-muxer. The intent isn't
// pixel-perfect parity (the browser uses different H.264 encoder
// settings, different text rasterizer, different font hinting) — it's
// "visually equivalent" output that the operator can download without
// queueing a server render.
//
// Architecture overview
// ─────────────────────
// One async pull loop, driven by `decodeVideoFrames` from
// ./videoDecoder.js, that yields the trimmed talking-head's video
// frames in display order. For each in-scope trimmed frame we:
//
//   1. Map its trimmed timestamp to the output timeline using the
//      canvas's per-story video_t_start/end slices.
//   2. Composite onto an OffscreenCanvas: bg video (looped), trimmed
//      frame in the video panel, sidebar image in the picture panel,
//      lower-third strap with the active story's headline, scrolling
//      ticker assembled from every story's headline.
//   3. Wrap the canvas in a VideoFrame with the output PTS, hand to
//      VideoEncoder.
//
// Audio runs in parallel as a separate AsyncIterable from
// ./audioBridge.js. We pump its EncodedAudioChunks into the muxer as
// they arrive. Both pipelines feed mp4-muxer's video/audio inputs
// concurrently; the muxer takes care of A/V interleaving.
//
// What this matches in the server
// ───────────────────────────────
// The pipeline mirrors v1_bridge.render_bulletin's behaviour at canvas
// granularity: per-story trimmed slice → cover-cropped into the video
// panel, sidebar image with optional focal offset, lower-third strap
// with kicker chip + headline, scrolling ticker across the bulletin.
//
// What's intentionally simplified
// ───────────────────────────────
//   * Lower-third has no slide-in animation — server animates with an
//     ffmpeg x expression; we render a static strap. Easy follow-up.
//   * No watermark / channel-bug overlay — those land at publish-time
//     on the server (pipeline_v4.watermark.stamp_for_channel), so
//     client export deliberately matches the unstamped artifact.
//   * No intro reel + xfade — the server's xfade=0.8s transition is
//     a follow-up; for now intro_seconds>0 is ignored.
//   * Bg video sync: we sample the looping HTMLVideoElement at its
//     current playhead instead of frame-accurate decode. Visually
//     close, single-frame jitter possible.
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

import { decodeVideoFrames, probeVideoMetadata } from "./videoDecoder";
import {
  encodeAudioStream,
  probeAudioMetadata,
  isAudioEncodingSupported,
} from "./audioBridge";

// ─── Feature detection ───────────────────────────────────────────────

/** Does this browser have enough WebCodecs surface to run an export?
 *  Audio is optional — when the AudioEncoder isn't supported we ship
 *  video-only and surface a warning. */
export function isClientExportSupported() {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoDecoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof EncodedVideoChunk !== "undefined"
  );
}

// ─── Asset loaders ───────────────────────────────────────────────────

/** Fetch a URL into a Blob URL so plain <video>/<img> tags work
 *  without Authorization headers. Required for the protected
 *  `/api/v4/...` routes (they accept JWT via cookie OR query, and our
 *  same-origin fetch picks up the cookie). */
async function fetchAsBlobUrl(url) {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function loadVideoEl(src) {
  const v = document.createElement("video");
  v.src = src;
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error("video load failed: " + src)); };
    const cleanup = () => {
      v.removeEventListener("loadedmetadata", ok);
      v.removeEventListener("error", bad);
    };
    v.addEventListener("loadedmetadata", ok, { once: true });
    v.addEventListener("error", bad, { once: true });
  });
  try { await v.play(); } catch { /* autoplay restrictions can be ignored */ }
  return v;
}

async function loadImageEl(src) {
  if (!src) return null;
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed: " + src));
    img.src = src;
  });
}

// ─── Codec picking ──────────────────────────────────────────────────

/** Pick a supported H.264 codec string. Walk profiles in descending
 *  quality until one configures. Errors only if NONE work — that means
 *  WebCodecs isn't truly usable on this device. */
async function pickVideoCodec({ width, height, bitrate, fps }) {
  const candidates = [
    "avc1.640028", // High Profile, Level 4.0
    "avc1.4d0028", // Main Profile, Level 4.0
    "avc1.420028", // Baseline Profile, Level 4.0
  ];
  for (const codec of candidates) {
    try {
      const ok = await VideoEncoder.isConfigSupported({
        codec, width, height,
        bitrate, framerate: fps,
      });
      if (ok?.supported) return codec;
    } catch { /* try the next */ }
  }
  throw new Error("No supported H.264 encoder config on this browser");
}

// ─── Compositing helpers ────────────────────────────────────────────

const STRAP_KIND_LT = "lower_third";
const STRAP_KIND_TK = "ticker";

/** Pct → px in the layout's coordinate system. */
function pctX(layout, pct) { return Math.round(((pct ?? 0) / 100) * layout.width); }
function pctY(layout, pct) { return Math.round(((pct ?? 0) / 100) * layout.height); }

/** Resolve a text block from a story by kind, with defaults that
 *  match v1_bridge's broadcast look (red strap, yellow ticker). */
function resolveTextBlock(story, kind) {
  const blocks = story?.text_blocks || [];
  const hit = blocks.find((b) => b?.kind === kind);
  if (kind === STRAP_KIND_LT) {
    return {
      bg_color: hit?.bg_color || "#C01824",
      fg_color: hit?.fg_color || "#FFFFFF",
      text: hit?.text || story?.title_native || story?.title_english || "BREAKING",
    };
  }
  if (kind === STRAP_KIND_TK) {
    return {
      bg_color: hit?.bg_color || "#FFD400",
      fg_color: hit?.fg_color || "#000000",
      text: hit?.text || "",
    };
  }
  return null;
}

/** Cover-crop drawImage that honours the same x/y offset model the
 *  server's renderer uses. `fit` is "cover" or "contain"; offsets are
 *  0..100 percentages indicating which part of the source survives a
 *  cover crop (50/50 = centered). */
function drawCover(ctx, src, dx, dy, dw, dh, fit = "cover", ox = 50, oy = 50) {
  const sw = src.videoWidth || src.naturalWidth || src.width;
  const sh = src.videoHeight || src.naturalHeight || src.height;
  if (!sw || !sh) return;
  const srcRatio = sw / sh;
  const dstRatio = dw / dh;

  if (fit === "contain") {
    // Letterbox/pillar to fit.
    let w, h;
    if (srcRatio > dstRatio) {
      w = dw; h = dw / srcRatio;
    } else {
      h = dh; w = dh * srcRatio;
    }
    const x = dx + (dw - w) / 2;
    const y = dy + (dh - h) / 2;
    ctx.drawImage(src, x, y, w, h);
    return;
  }

  // cover: scale-to-fill then crop the excess on the overflow axis.
  // Choose the focal point via ox/oy (in 0..100 pct).
  let srcX = 0, srcY = 0, srcCropW = sw, srcCropH = sh;
  if (srcRatio > dstRatio) {
    // Source is wider; crop horizontally.
    srcCropW = sh * dstRatio;
    srcX = (sw - srcCropW) * (Math.max(0, Math.min(100, ox)) / 100);
  } else {
    // Source is taller; crop vertically.
    srcCropH = sw / dstRatio;
    srcY = (sh - srcCropH) * (Math.max(0, Math.min(100, oy)) / 100);
  }
  ctx.drawImage(src, srcX, srcY, srcCropW, srcCropH, dx, dy, dw, dh);
}

/** Draw the lower-third strap: red bar across the bottom with a
 *  white BREAKING chip and the active story's headline. Geometry
 *  mirrors v1_bridge: strap is ~13% of canvas height at the bottom,
 *  chip is ~36% of strap height wide. */
function drawLowerThird(ctx, layout, story, kicker = "BREAKING") {
  const lt = resolveTextBlock(story, STRAP_KIND_LT);
  const ltH = Math.round(layout.height * 0.115);
  const ltY = layout.height - ltH;
  const tickH = Math.round(layout.height * 0.05);

  // Strap fills full width above the ticker.
  const strapY = ltY - tickH;
  ctx.fillStyle = lt.bg_color;
  ctx.fillRect(0, strapY, layout.width, ltH);

  // 2px darker bottom line for visual separation, matches preview.
  ctx.fillStyle = lt.bg_color;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, strapY + ltH - 4, layout.width, 4);
  ctx.globalAlpha = 1;

  // BREAKING chip (white background, strap-bg text).
  const chipPad = Math.round(ltH * 0.18);
  const chipW = Math.round(ltH * 2.5);
  const chipH = ltH - chipPad * 2;
  const chipX = chipPad;
  const chipY = strapY + chipPad;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(chipX, chipY, chipW, chipH);

  ctx.fillStyle = lt.bg_color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = `900 ${Math.round(chipH * 0.5)}px "Helvetica Neue", "Segoe UI", sans-serif`;
  ctx.fillText(kicker, chipX + chipW / 2, chipY + chipH / 2);

  // Headline next to the chip.
  ctx.fillStyle = lt.fg_color;
  ctx.textAlign = "left";
  ctx.font = `800 ${Math.round(chipH * 0.7)}px "Noto Sans Telugu", "Noto Sans", "Segoe UI", sans-serif`;
  const headline = (lt.text || "").slice(0, 80);
  ctx.fillText(headline, chipX + chipW + chipPad, chipY + chipH / 2);
}

/** Yellow ticker bar across the very bottom with a scrolling text
 *  string. Server uses x = W - mod(t*ticker_speed_px_s, w + W); same
 *  expression here keeps the visual cadence identical. */
function drawTicker(ctx, layout, stories, outputTimeSec, tickerSpeedPxS = 200) {
  const tickH = Math.round(layout.height * 0.05);
  const tickY = layout.height - tickH;

  // Pull every headline into a single rolling string.
  const headlines = (stories || [])
    .map((s) => (s.title_native || s.title_english || "").trim())
    .filter(Boolean);
  const text = (headlines.join("  ★  ") || "KAIZER NEWS") + "    ";

  // Need the ticker BG colour from any story's ticker block (server
  // uses the first story's). Falls back to broadcast yellow.
  const tk = resolveTextBlock(stories?.[0], STRAP_KIND_TK);
  ctx.fillStyle = tk.bg_color;
  ctx.fillRect(0, tickY, layout.width, tickH);

  // Measure the text once at the current font; recompute on every
  // frame so layout changes (font, size) are honoured.
  ctx.fillStyle = tk.fg_color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.round(tickH * 0.6)}px "Noto Sans Telugu", "Noto Sans", "Segoe UI", sans-serif`;
  const m = ctx.measureText(text);
  const tw = m.width;
  const W = layout.width;

  // Server expression: x = W - mod(t * v, w + W).
  // Hence x sweeps from W (offscreen right) back to -tw (offscreen
  // left), looping every (tw+W)/v seconds.
  const period = tw + W;
  const x = W - ((outputTimeSec * tickerSpeedPxS) % period);
  // Draw twice so the scroll has no visible gap when it wraps.
  ctx.fillText(text, x, tickY + tickH / 2);
  ctx.fillText(text, x + period, tickY + tickH / 2);
}

/** Find the sidebar image for a story at a given local time
 *  (seconds into the story). Honours the story's `images` carousel
 *  with t_start/t_end timing; falls back to the first image when no
 *  timed entry covers the moment. */
function pickStoryImage(story, localTime) {
  const imgs = story?.images || [];
  if (!imgs.length) return null;
  const hit = imgs.find((img) =>
    localTime >= (img.t_start ?? 0) &&
    localTime < (img.t_end ?? Infinity)
  );
  return hit || imgs[0];
}

// ─── Main exporter ──────────────────────────────────────────────────

/**
 * Full bulletin export. Reads the canvas state + the trimmed talking
 * head and writes a downloadable mp4.
 *
 * @param {Object}   opts
 * @param {Object}   opts.canvasState  - canvas.bulletin shape from
 *                                       the V4 editor (stories +
 *                                       layout + seo metadata)
 * @param {string}   opts.trimmedUrl   - URL to the trimmed bulletin
 *                                       source mp4 (talking head)
 * @param {string}   [opts.bgUrl]      - looping bg video URL ("" or
 *                                       null = flat colour)
 * @param {number}   [opts.bgVolume=0]
 * @param {(filename:string) => string} [opts.resolvePoolUrl]
 *                                     - given a pool filename, return
 *                                       its served URL (with auth
 *                                       query if needed). Lets the
 *                                       caller decide where pool
 *                                       images live.
 * @param {number}   [opts.fps=30]
 * @param {number}   [opts.videoBitrate=6_000_000]
 * @param {AbortSignal} [opts.signal]
 * @param {(p:{frame:number,total:number,pct:number,phase:string})=>void}
 *           [opts.onProgress]
 * @returns {Promise<Blob>} mp4
 */
export async function exportBulletinClient({
  canvasState,
  trimmedUrl,
  bgUrl = "",
  bgVolume = 0,
  resolvePoolUrl = (fn) => fn,
  fps = 30,
  videoBitrate = 6_000_000,
  signal,
  onProgress,
}) {
  if (!isClientExportSupported()) {
    throw new Error("WebCodecs not supported in this browser");
  }
  if (!canvasState?.layout || !canvasState?.stories?.length) {
    throw new Error("canvasState must have layout + at least one story");
  }
  if (!trimmedUrl) {
    throw new Error("trimmedUrl is required");
  }

  const layout = canvasState.layout;
  const stories = canvasState.stories;
  const width = layout.width || 1920;
  const height = layout.height || 1080;

  // Sum of slice durations = output duration. The server's render uses
  // exactly this when it concatenates per-story composes.
  const outputDuration = stories.reduce(
    (acc, s) => acc + Math.max(0, (s.video_t_end ?? 0) - (s.video_t_start ?? 0)),
    0
  );
  if (outputDuration <= 0) {
    throw new Error("Stories have zero total duration; nothing to render");
  }

  onProgress?.({ frame: 0, total: 0, pct: 0, phase: "preflight" });

  // ── 1. Preflight: pick codec, load bg video + sidebar images ────
  const codec = await pickVideoCodec({ width, height, bitrate: videoBitrate, fps });

  let bgVideoEl = null;
  let bgBlobUrl = "";
  if (bgUrl) {
    bgBlobUrl = await fetchAsBlobUrl(bgUrl);
    bgVideoEl = await loadVideoEl(bgBlobUrl);
  }

  // For each story, decide which images to preload. We preload the
  // FIRST image of each story up front so the first-frame draw isn't
  // blocked; subsequent images load on-demand and may briefly fall
  // back to the previous image until they're decoded.
  const sidebarCache = new Map(); // filename -> HTMLImageElement
  const sidebarBlobUrls = new Map(); // filename -> blob URL (for cleanup)
  async function ensureSidebar(filename) {
    if (!filename) return null;
    if (sidebarCache.has(filename)) return sidebarCache.get(filename);
    const url = resolvePoolUrl(filename);
    if (!url) return null;
    const blobUrl = await fetchAsBlobUrl(url);
    sidebarBlobUrls.set(filename, blobUrl);
    const img = await loadImageEl(blobUrl);
    sidebarCache.set(filename, img);
    return img;
  }
  // Preload first image per story in parallel.
  await Promise.all(
    stories.map((s) => {
      const firstImg = s.images?.[0];
      return firstImg?.src ? ensureSidebar(firstImg.src).catch(() => null) : null;
    })
  );

  // ── 2. Set up muxer + encoders ──────────────────────────────────
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width, height,
      frameRate: fps,
    },
    audio: undefined, // populated below if we have audio
    fastStart: "in-memory",
  });

  // Re-build muxer with audio once we know the audio metadata. Easier
  // than threading audio config through later — we just probe first.
  let audioMeta = null;
  let muxerWithAudio = muxer;
  try {
    audioMeta = await probeAudioMetadata(trimmedUrl);
  } catch {
    audioMeta = null;
  }
  const audioOk =
    audioMeta &&
    typeof AudioEncoder !== "undefined" &&
    (await isAudioEncodingSupported());
  if (audioOk) {
    // Rebuild the muxer with an audio config now that we know it.
    muxerWithAudio = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width, height, frameRate: fps },
      audio: {
        codec: "aac",
        sampleRate: 48000,
        numberOfChannels: Math.min(2, audioMeta.num_channels || 2),
      },
      fastStart: "in-memory",
    });
  }

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxerWithAudio.addVideoChunk(chunk, meta),
    error: (e) => { throw new Error("video encoder: " + e.message); },
  });
  videoEncoder.configure({
    codec, width, height,
    bitrate: videoBitrate,
    framerate: fps,
  });

  // ── 3. Compositing canvas ───────────────────────────────────────
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false });

  // ── 4. Concurrent audio encode (drains while video composites) ──
  let audioDone = false;
  let audioErr = null;
  const audioPromise = audioOk
    ? (async () => {
        try {
          for await (const { chunk, meta } of encodeAudioStream({
            talkingHeadUrl: trimmedUrl,
            bgUrl: bgVideoEl && bgVolume > 0 ? bgBlobUrl : undefined,
            bgVolume: bgVolume,
            durationSec: outputDuration,
            sampleRate: 48000,
            channels: Math.min(2, audioMeta.num_channels || 2),
            signal,
          })) {
            if (signal?.aborted) return;
            muxerWithAudio.addAudioChunk(chunk, meta);
          }
        } catch (e) {
          audioErr = e;
        } finally {
          audioDone = true;
        }
      })()
    : Promise.resolve();

  // ── 5. Pull loop: trimmed frame → composite → encode ───────────
  // Pre-compute cumulative offsets so we can map a trimmed timestamp
  // to an output timestamp without re-walking the stories list per
  // frame.
  const storyOffsets = []; // story i's start in output timeline (sec)
  let cum = 0;
  for (const s of stories) {
    storyOffsets.push(cum);
    cum += Math.max(0, (s.video_t_end ?? 0) - (s.video_t_start ?? 0));
  }

  const totalFrames = Math.floor(outputDuration * fps);
  let outputFrameIdx = 0;
  let lastEmittedSec = -1;

  /** Find the story containing this trimmed timestamp. Returns
   *  { idx, story, localTime, outTimeSec } or null if out of scope.
   *  Used per-frame; cheap O(N_stories) scan. */
  function mapTrimmedToOutput(tTrimmedSec) {
    for (let i = 0; i < stories.length; i++) {
      const s = stories[i];
      const ts = s.video_t_start ?? 0;
      const te = s.video_t_end ?? 0;
      if (tTrimmedSec >= ts && tTrimmedSec < te) {
        return {
          idx: i,
          story: s,
          localTime: tTrimmedSec - ts,
          outTimeSec: storyOffsets[i] + (tTrimmedSec - ts),
        };
      }
    }
    return null;
  }

  onProgress?.({ frame: 0, total: totalFrames, pct: 0, phase: "encoding" });

  try {
    for await (const frame of decodeVideoFrames(trimmedUrl, { signal })) {
      if (signal?.aborted) { frame.close(); break; }
      const tTrimmedSec = frame.timestamp / 1_000_000;
      const map = mapTrimmedToOutput(tTrimmedSec);
      if (!map) {
        // Trimmed frame lives in a gap between story slices — drop it.
        frame.close();
        continue;
      }
      // Enforce monotonically increasing PTS for the encoder.
      if (map.outTimeSec <= lastEmittedSec) {
        frame.close();
        continue;
      }
      lastEmittedSec = map.outTimeSec;

      // ── Composite ──
      // (a) bg layer — looping video or flat colour.
      if (bgVideoEl && bgVideoEl.readyState >= 2) {
        drawCover(ctx, bgVideoEl, 0, 0, width, height, "cover", 50, 50);
      } else {
        ctx.fillStyle = layout.bg_color || "#000000";
        ctx.fillRect(0, 0, width, height);
      }

      // (b) trimmed talking-head in the video panel.
      drawCover(
        ctx, frame,
        pctX(layout, layout.video_x_pct),
        pctY(layout, layout.video_y_pct),
        pctX(layout, layout.video_w_pct),
        pctY(layout, layout.video_h_pct),
        "cover", 50, 50,
      );

      // (c) sidebar image — the active story's chosen image, honouring
      //     its t_start/t_end + fit/offset.
      const imgEntry = pickStoryImage(map.story, map.localTime);
      if (imgEntry?.src) {
        let imgEl = sidebarCache.get(imgEntry.src);
        if (!imgEl) {
          // Lazy-load any subsequent images. While the load is in
          // flight we draw the previous image (or nothing).
          ensureSidebar(imgEntry.src).catch(() => {});
        }
        if (imgEl) {
          drawCover(
            ctx, imgEl,
            pctX(layout, layout.picture_x_pct),
            pctY(layout, layout.picture_y_pct),
            pctX(layout, layout.picture_w_pct),
            pctY(layout, layout.picture_h_pct),
            imgEntry.fit || "cover",
            imgEntry.offset_x_pct ?? 50,
            imgEntry.offset_y_pct ?? 50,
          );
        }
      }

      // (d) lower-third strap + (e) ticker.
      drawLowerThird(ctx, layout, map.story);
      drawTicker(ctx, layout, stories, map.outTimeSec);

      // ── Encode ──
      const outFrame = new VideoFrame(canvas, {
        timestamp: Math.round(map.outTimeSec * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      // Keyframe every `fps` frames keeps the result seekable.
      const keyFrame = (outputFrameIdx % fps) === 0;
      videoEncoder.encode(outFrame, { keyFrame });
      outFrame.close();
      frame.close();
      outputFrameIdx++;

      // Progress + cooperative yield. Long exports starve the UI
      // without a periodic yield to the event loop.
      if (outputFrameIdx % 15 === 0 && onProgress) {
        onProgress({
          frame: outputFrameIdx,
          total: totalFrames,
          pct: Math.min(1, outputFrameIdx / Math.max(1, totalFrames)),
          phase: "encoding",
        });
      }
      if (outputFrameIdx % fps === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
      // Backpressure — VideoEncoder buffers up to encodeQueueSize
      // frames; if we're too far ahead the encoder will OOM. Cap at
      // 2 seconds worth.
      while (videoEncoder.encodeQueueSize > fps * 2) {
        await new Promise((r) => setTimeout(r, 5));
      }
    }

    await videoEncoder.flush();
    videoEncoder.close();

    // Wait for the audio side to finish, then finalize.
    onProgress?.({ frame: outputFrameIdx, total: totalFrames, pct: 1, phase: "finalizing" });
    await audioPromise;
    if (audioErr) {
      // Audio failed — but we still ship the video. Log + continue.
      // eslint-disable-next-line no-console
      console.warn("[clientExporter] audio pipeline failed, exporting video only:", audioErr);
    }

    muxerWithAudio.finalize();
    return new Blob([muxerWithAudio.target.buffer], { type: "video/mp4" });
  } finally {
    // Free assets the loop touched.
    if (bgVideoEl) {
      bgVideoEl.pause();
      bgVideoEl.src = "";
      bgVideoEl.remove();
    }
    if (bgBlobUrl) URL.revokeObjectURL(bgBlobUrl);
    for (const url of sidebarBlobUrls.values()) URL.revokeObjectURL(url);
    sidebarCache.clear();
    sidebarBlobUrls.clear();
  }
}

// ─── Download helper ────────────────────────────────────────────────

/** Trigger a browser download of a Blob with the given filename. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 2000);
}

// ─── Dev-only self test ─────────────────────────────────────────────

/** Smoke test from the browser console:
 *    import("./lib/clientExporter.js").then(m =>
 *      m.__runSelfTest({
 *        canvasState: ..., trimmedUrl: "...", bgUrl: "..."
 *      })
 *    )
 *  Logs progress and downloads the resulting mp4. */
export async function __runSelfTest(opts) {
  console.group("[clientExporter selfTest]");
  try {
    const t0 = performance.now();
    const blob = await exportBulletinClient({
      ...opts,
      onProgress: (p) => console.log("progress:", p),
    });
    const ms = performance.now() - t0;
    console.log("done:", { ms, blobBytes: blob.size });
    downloadBlob(blob, `selftest_${Date.now()}.mp4`);
    return { ok: true, ms, blobBytes: blob.size };
  } catch (e) {
    console.error("selfTest FAILED:", e);
    return { ok: false, error: e };
  } finally {
    console.groupEnd();
  }
}
