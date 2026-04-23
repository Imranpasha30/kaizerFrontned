import React, { useEffect, useMemo, useRef } from "react";

/**
 * ProgramPreview — canvas-based composer preview for phone-camera test mode.
 *
 * Mirrors what the server Composer would render, but entirely in the browser
 * so the user can test the full Live Director experience with only phone
 * cameras (no FFmpeg, no RTMP, no HLS required).
 *
 * Each camera's webm chunks arrive via /api/live/ws/monitor/{event}/{cam}
 * (same fan-out the per-tile preview uses). We feed them into a hidden
 * <video> per camera via MediaSource, then every animation frame we call
 * ctx.drawImage(video, ...) on the visible <canvas> according to the active
 * layout — so the composited feed updates at ~60fps.
 *
 * Layouts supported match the server Composer + LayoutPreview vocabulary:
 *   single / split2_hstack / split2_vstack / pip / quad / bridge
 */
export default function ProgramPreview({
  eventId,
  cameras,            // [{cam_id, label, role_hints}]
  layout = "single",
  primary,            // cam_id of the primary/active camera
  layoutCams = [],    // ordered cam_ids used by multi-cam layouts
  className = "",
}) {
  const canvasRef = useRef(null);
  const videosRef = useRef(new Map()); // cam_id → <video>

  // Open a monitor WebSocket per phone-role camera.
  useEffect(() => {
    const phoneCams = cameras.filter((c) =>
      Array.isArray(c.role_hints) && c.role_hints.includes("phone")
    );
    const cleanups = [];

    for (const c of phoneCams) {
      const { cam_id } = c;

      // Build hidden <video> + MediaSource + SourceBuffer for this cam.
      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.display = "none";
      document.body.appendChild(video);

      const ms = new MediaSource();
      video.src = URL.createObjectURL(ms);

      const queue = [];
      let sb = null;
      const flush = () => {
        if (!sb || sb.updating || queue.length === 0) return;
        try { sb.appendBuffer(queue.shift()); } catch { /* noop */ }
      };
      ms.addEventListener("sourceopen", () => {
        try { sb = ms.addSourceBuffer('video/webm; codecs="vp9,opus"'); }
        catch {
          try { sb = ms.addSourceBuffer('video/webm; codecs="vp8,opus"'); }
          catch { return; }
        }
        sb.mode = "sequence";
        sb.addEventListener("updateend", flush);
      });

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${window.location.host}/api/live/ws/monitor/${encodeURIComponent(eventId)}/${encodeURIComponent(cam_id)}`;
      let ws;
      try {
        ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        ws.onmessage = (e) => { queue.push(e.data); flush(); };
      } catch { /* noop */ }

      videosRef.current.set(cam_id, video);
      cleanups.push(() => {
        try { if (ws) ws.close(); } catch {}
        try { if (ms.readyState === "open") ms.endOfStream(); } catch {}
        try { video.remove(); } catch {}
        videosRef.current.delete(cam_id);
      });
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [eventId, cameras]);

  // The render loop — draw the current layout onto the canvas every frame.
  const orderedCams = useMemo(() => {
    if (layout === "single" || layout === "bridge") {
      const p = primary || layoutCams[0] || (cameras[0]?.cam_id);
      return p ? [p] : [];
    }
    return layoutCams.length ? layoutCams : cameras.map((c) => c.cam_id);
  }, [layout, primary, layoutCams, cameras]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);

      const vids = orderedCams
        .map((cid) => videosRef.current.get(cid))
        .filter(Boolean);

      try {
        if (layout === "bridge") {
          // Centred "BRIDGE" text on a dark card
          ctx.fillStyle = "#0c0c0c";
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = "#e74c3c";
          ctx.font = "bold 28px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("BRIDGE", w / 2, h / 2);
        } else if (layout === "split2_hstack" && vids.length >= 2) {
          drawCovered(ctx, vids[0], 0, 0, w / 2, h);
          drawCovered(ctx, vids[1], w / 2, 0, w / 2, h);
          ctx.strokeStyle = "#050505";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
        } else if (layout === "split2_vstack" && vids.length >= 2) {
          drawCovered(ctx, vids[0], 0, 0, w, h / 2);
          drawCovered(ctx, vids[1], 0, h / 2, w, h / 2);
        } else if (layout === "pip" && vids.length >= 2) {
          drawCovered(ctx, vids[0], 0, 0, w, h);
          const pw = Math.round(w / 4);
          const ph = Math.round(h / 4);
          const px = w - pw - 16;
          const py = h - ph - 16;
          ctx.fillStyle = "#050505";
          ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
          drawCovered(ctx, vids[1], px, py, pw, ph);
        } else if (layout === "quad" && vids.length >= 4) {
          const qw = w / 2, qh = h / 2;
          drawCovered(ctx, vids[0], 0,   0,   qw, qh);
          drawCovered(ctx, vids[1], qw,  0,   qw, qh);
          drawCovered(ctx, vids[2], 0,   qh,  qw, qh);
          drawCovered(ctx, vids[3], qw,  qh,  qw, qh);
        } else if (vids.length >= 1) {
          // single (default / fallback)
          drawCovered(ctx, vids[0], 0, 0, w, h);
        } else {
          // No video yet — show a "waiting" state
          ctx.fillStyle = "#0a0a0a";
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = "#5c5c5c";
          ctx.font = "13px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Waiting for a camera feed…", w / 2, h / 2);
        }
      } catch {
        // drawImage can throw if the video has no current frame yet — retry next frame
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [layout, orderedCams]);

  return (
    <canvas
      ref={canvasRef}
      width={960}
      height={540}
      className={`w-full bg-black rounded border border-border aspect-video ${className}`.trim()}
    />
  );
}

/** drawImage with object-fit: cover semantics — no letterboxing inside a cell. */
function drawCovered(ctx, video, dx, dy, dw, dh) {
  if (!video.videoWidth || !video.videoHeight) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const vAspect = vw / vh;
  const dAspect = dw / dh;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (vAspect > dAspect) {
    // source is wider → crop horizontally
    sw = vh * dAspect;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / dAspect;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
}
