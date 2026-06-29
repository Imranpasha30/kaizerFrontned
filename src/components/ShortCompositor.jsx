/**
 * ShortCompositor — live preview of a 9:16 SHORT: the RAW trimmed short video playing inside
 * the short's section layout (video / headline / image bands), with a transport bar. A short
 * is a static composition (one clip + one headline + one image), so there's no time-synced
 * carousel — we just play the clip in its section and overlay the headline + image. Mirrors
 * the V1 short layouts (torn_card / clean_card / follow_bar / split_frame) by section_pct.
 *
 * Props:
 *   videoSrc     : already-authed URL of the raw trimmed short clip
 *   layout       : "torn_card" | "clean_card" | "follow_bar" | "split_frame"
 *   text         : headline
 *   textColor    : headline color (#hex)
 *   imageUrl     : already-authed image URL (or "")
 *   sectionPct   : { video, text, image } fractions of the 1920 height
 *   followParams : { follow_text, follow_text_color, bg_color, text_color }
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const W = 1080, H = 1920;
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export default function ShortCompositor({ videoSrc, layout = "torn_card", text = "", textColor = "#ffffff",
                                          imageUrl = "", sectionPct = {}, followParams = {} }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  const [now, setNow] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const s = Math.min(r.width / W, (r.height || (r.width * H / W)) / H);
      if (s > 0 && Number.isFinite(s)) setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); } };
  const seek = (t) => { const v = videoRef.current; if (v) { v.currentTime = t; setNow(t); } };

  const sp = useMemo(() => ({
    video: sectionPct.video ?? 0.4619, text: sectionPct.text ?? 0.1691, image: sectionPct.image ?? 0.3690,
  }), [sectionPct]);

  const Video = (style) => (
    <video ref={videoRef} src={videoSrc} playsInline muted loop
      onLoadedMetadata={(e) => setDur(e.target.duration || 0)}
      onTimeUpdate={(e) => setNow(e.target.currentTime || 0)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      style={{ position: "absolute", objectFit: "cover", background: "#000", ...style }} />
  );
  const Img = (style) => (imageUrl
    ? <img src={imageUrl} alt="" style={{ position: "absolute", objectFit: "cover", ...style }} />
    : <div style={{ position: "absolute", background: "#141c2b", display: "flex", alignItems: "center",
        justifyContent: "center", color: "#789", fontWeight: 600, ...style }}>image</div>);

  // Compose the stage by layout family.
  let body;
  if (layout === "split_frame") {
    body = (<>
      {Video({ left: 0, top: 0, width: "50%", height: "100%" })}
      {Img({ left: "50%", top: 0, width: "50%", height: "100%" })}
      {text && <div style={{ position: "absolute", left: 0, right: 0, bottom: "6%", textAlign: "center",
        color: textColor, fontWeight: 800, fontSize: 0.04 * H, textShadow: "0 2px 14px #000",
        padding: "0 4%" }}>{text}</div>}
    </>);
  } else if (layout === "follow_bar") {
    const barH = 0.16 * H;
    const fb = followParams || {};
    body = (<>
      {Video({ left: 0, top: 0, width: "100%", height: H - barH })}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: barH,
        background: fb.bg_color || "#0b1020", display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "0 5%" }}>
        <div style={{ color: fb.text_color || textColor || "#fff", fontWeight: 800, fontSize: 0.038 * H, lineHeight: 1.1 }}>{text}</div>
        <div style={{ color: fb.follow_text_color || "#ffd400", fontWeight: 800, fontSize: 0.03 * H, marginTop: "1%" }}>
          {fb.follow_text || "FOLLOW ➜"}
        </div>
      </div>
    </>);
  } else {
    // torn_card / clean_card: stacked video / headline band / image
    const vH = sp.video * H, iH = sp.image * H, tH = H - vH - iH;
    body = (<>
      {Video({ left: 0, top: 0, width: "100%", height: vH })}
      <div style={{ position: "absolute", left: 0, top: vH, width: "100%", height: tH,
        background: layout === "clean_card" ? "#0b1020" : "#c8102e",
        display: "flex", alignItems: "center", padding: "0 6%" }}>
        <div style={{ color: textColor || "#fff", fontWeight: 900, lineHeight: 1.08,
          fontSize: Math.min(0.052 * H, (tH * 0.42)), textShadow: "0 2px 10px rgba(0,0,0,.4)" }}>{text}</div>
      </div>
      {Img({ left: 0, top: vH + tH, width: "100%", height: iH })}
    </>);
  }

  return (
    <div className="w-full h-full flex flex-col bg-black">
      <div ref={wrapRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "center",
                      position: "relative", background: "#000", flex: "none" }}>
          {body}
        </div>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 bg-[#0d1119] border-t border-gray-800">
        <button onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center shrink-0">
          {playing ? "❙❙" : "▶"}
        </button>
        <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{fmt(now)} / {fmt(dur)}</span>
        <input type="range" min={0} max={dur || 0} step={0.05} value={Math.min(now, dur || 0)}
          onChange={(e) => seek(parseFloat(e.target.value))} className="flex-1 accent-orange-500" />
        <span className="text-[11px] text-gray-500 shrink-0">{layout} · live preview</span>
      </div>
    </div>
  );
}
