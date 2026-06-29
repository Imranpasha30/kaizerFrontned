/**
 * LiveCompositor — a Canva-grade, time-synced LIVE preview of a V4 bulletin scene.
 *
 * Plays the RAW cut video and renders the scene as an HTML/CSS overlay synced to
 * video.currentTime — image carousel with transitions, timed lower-thirds, a scrolling
 * ticker — so you see the finished result WITHOUT rendering. Everything is read from
 * canvas.json (the single source of truth); nothing here re-renders or hits the backend.
 *
 * Timing model (from canvas_schema):
 *   - story.video_t_start / video_t_end are ABSOLUTE seconds in the trimmed video.
 *   - image.t_start/t_end and text_block.t_start/t_end are RELATIVE to the story start.
 *
 * Props:
 *   stories    : canvas.bulletin.stories
 *   layout     : canvas.bulletin.layout (region %s, colors)
 *   videoSrc   : already-authed URL of the raw trimmed bulletin video
 *   imagePool  : [{ filename, url }] from GET /canvas pool_listing (url not yet authed)
 *   withAuth   : (url) => url+token  (so <img>/<video> can load behind JWT)
 *   headline   : fallback headline string
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const KEYFRAMES = `
@keyframes kxc-fade   { from { opacity:0 } to { opacity:1 } }
@keyframes kxc-sl-l   { from { opacity:0; transform:translateX(8%) } to { opacity:1; transform:translateX(0) } }
@keyframes kxc-sl-r   { from { opacity:0; transform:translateX(-8%) } to { opacity:1; transform:translateX(0) } }
@keyframes kxc-zoom   { from { opacity:0; transform:scale(1.12) } to { opacity:1; transform:scale(1) } }
@keyframes kxc-ticker { from { transform:translateX(0) } to { transform:translateX(-50%) } }
`;
const ANIM = { fade: "kxc-fade", slide_left: "kxc-sl-l", slide_right: "kxc-sl-r", zoom_in: "kxc-zoom", cut: "" };

const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const pct = (v, d) => `${(v == null ? d : v)}%`;

export default function LiveCompositor({ stories = [], layout = {}, videoSrc, imagePool = [], withAuth = (u) => u, headline = "",
                                         onTickerSpeedChange = null, onTickerColorChange = null }) {
  const W = layout.width || 1920, H = layout.height || 1080;
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  const [now, setNow] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tickerSpeed, setTickerSpeed] = useState(28);   // seconds for one full loop (lower = faster)
  const [tickerColor, setTickerColor] = useState("#ffd400");

  // Seed the ticker controls from the saved canvas so the preview reflects
  // what will render, and edits round-trip through canvas.json.
  useEffect(() => {
    for (const s of stories || []) {
      for (const b of (s.text_blocks || [])) {
        if (b.kind === "ticker") {
          if (b.ticker_speed) setTickerSpeed(b.ticker_speed);
          if (b.ticker_color) setTickerColor(b.ticker_color);
          return;
        }
      }
    }
  }, [stories]);

  const poolMap = useMemo(() => {
    const m = {};
    for (const p of imagePool || []) if (p && p.filename) m[p.filename] = withAuth(p.url);
    return m;
  }, [imagePool, withAuth]);

  // scale the fixed-size stage to fit the wrapper
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
  }, [W, H]);

  // time sync: rAF, re-render ~20fps; CSS handles smooth transitions
  useEffect(() => {
    let raf, last = -1;
    const loop = () => {
      const v = videoRef.current;
      if (v) {
        const t = v.currentTime || 0;
        if (Math.abs(t - last) > 0.05) { last = t; setNow(t); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // active story / image / text blocks at the current playhead
  const { story, storyIdx, local } = useMemo(() => {
    let idx = stories.findIndex((s) => now >= (s.video_t_start || 0) && now < (s.video_t_end || 0));
    if (idx < 0) idx = now <= 0 ? 0 : stories.length - 1;
    const s = stories[idx] || null;
    return { story: s, storyIdx: idx, local: s ? Math.max(0, now - (s.video_t_start || 0)) : 0 };
  }, [stories, now]);

  const { activeImg, activeImgIdx } = useMemo(() => {
    if (!story || !(story.images || []).length) return { activeImg: null, activeImgIdx: -1 };
    const imgs = story.images;
    const durStory = (story.video_t_end || 0) - (story.video_t_start || 0);
    let i = imgs.findIndex((im) => local >= (im.t_start || 0) && local < (im.t_end || durStory || 1e9));
    if (i < 0) i = imgs.length - 1;     // before first window / gaps → hold the nearest
    return { activeImg: imgs[i], activeImgIdx: i };
  }, [story, local]);

  const lowerThirds = useMemo(() => {
    if (!story) return [];
    return (story.text_blocks || []).filter((b) => b.kind !== "ticker" && b.kind !== "watermark"
      && local >= (b.t_start || 0) && (b.t_end == null || local < b.t_end));
  }, [story, local]);

  const tickerText = useMemo(() => {
    const fromBlocks = (stories || []).flatMap((s) => (s.text_blocks || []).filter((b) => b.kind === "ticker").map((b) => b.text));
    const titles = (stories || []).map((s) => s.title_native || s.title_english).filter(Boolean);
    const parts = (fromBlocks.length ? fromBlocks : titles);
    return parts.length ? parts.join("      •      ") : "";
  }, [stories]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }, []);
  const seek = (t) => { const v = videoRef.current; if (v) { v.currentTime = t; setNow(t); } };

  const imgSrc = activeImg ? poolMap[activeImg.src] : null;
  const effDur = activeImg ? (activeImg.effect_duration ?? 0.4) : 0;
  const anim = activeImg ? ANIM[activeImg.effect || "fade"] : "";

  return (
    <div className="w-full h-full flex flex-col bg-black">
      <style>{KEYFRAMES}</style>
      {/* stage */}
      <div ref={wrapRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "center",
                      position: "relative", background: layout.bg_color || "#000", flex: "none" }}>
          {/* base: raw cut video at the video region */}
          <video ref={videoRef} src={videoSrc} playsInline muted loop
            onLoadedMetadata={(e) => setDur(e.target.duration || 0)}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            style={{ position: "absolute", left: pct(layout.video_x_pct, 0), top: pct(layout.video_y_pct, 0),
                     width: pct(layout.video_w_pct, 100), height: pct(layout.video_h_pct, 100),
                     objectFit: "cover", background: "#000" }} />

          {/* image carousel at the picture region */}
          {layout.picture_w_pct !== 0 && (
            <div style={{ position: "absolute", left: pct(layout.picture_x_pct, 70), top: pct(layout.picture_y_pct, 8),
                          width: pct(layout.picture_w_pct, 26), height: pct(layout.picture_h_pct, 40),
                          overflow: "hidden", borderRadius: 8, background: imgSrc ? "#000" : "transparent",
                          boxShadow: imgSrc ? "0 8px 30px rgba(0,0,0,.5)" : "none" }}>
              {imgSrc && (
                <img key={`${storyIdx}:${activeImgIdx}:${activeImg.src}`} src={imgSrc} alt=""
                  style={{ width: "100%", height: "100%", display: "block",
                           objectFit: activeImg.fit === "contain" ? "contain" : "cover",
                           objectPosition: `${activeImg.offset_x_pct ?? 50}% ${activeImg.offset_y_pct ?? 50}%`,
                           animation: anim ? `${anim} ${effDur}s ease-out` : "none" }} />
              )}
            </div>
          )}

          {/* lower-thirds / headline text blocks */}
          {lowerThirds.map((b, i) => (
            <div key={i} style={{ position: "absolute",
              left: pct(b.x_pct, 4), top: pct(b.y_pct, 78), width: pct(b.w_pct, 64),
              color: b.fg_color || "#fff", background: b.bg_color || "rgba(192,24,36,.92)",
              padding: "0.5% 1%", borderRadius: 6, fontWeight: 800, lineHeight: 1.15,
              fontSize: `${((b.font_size_pct || 4.2) / 100) * H}px`,
              textShadow: b.bg_color ? "none" : "0 2px 12px rgba(0,0,0,.7)" }}>
              {b.text}
            </div>
          ))}
          {/* fallback headline if the story has no explicit lower-third block */}
          {!lowerThirds.length && (story?.title_native || story?.title_english || headline) && (
            <div style={{ position: "absolute", left: "4%", top: "78%", width: "64%", color: "#fff",
              background: "rgba(192,24,36,.92)", padding: "0.5% 1%", borderRadius: 6, fontWeight: 800,
              lineHeight: 1.15, fontSize: `${0.044 * H}px` }}>
              {story?.title_native || story?.title_english || headline}
            </div>
          )}

          {/* scrolling ticker */}
          {tickerText && (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${0.072 * H}px`,
              background: tickerColor, color: "#111", display: "flex", alignItems: "center", overflow: "hidden",
              fontWeight: 800, fontSize: `${0.034 * H}px` }}>
              <div style={{ whiteSpace: "nowrap", animation: `kxc-ticker ${tickerSpeed}s linear infinite`,
                            paddingLeft: "100%", willChange: "transform" }}>
                {tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tickerText}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* transport bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-[#0d1119] border-t border-gray-800">
        <button onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center shrink-0">
          {playing ? "❙❙" : "▶"}
        </button>
        <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{fmt(now)} / {fmt(dur)}</span>
        <div className="relative flex-1">
          <input type="range" min={0} max={dur || 0} step={0.05} value={Math.min(now, dur || 0)}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full accent-orange-500" />
          {/* story markers */}
          {dur > 0 && stories.map((s, i) => (
            <span key={i} title={`Story ${i + 1}`}
              style={{ position: "absolute", top: "50%", transform: "translate(-50%,-50%)",
                       left: `${((s.video_t_start || 0) / dur) * 100}%`, width: 2, height: 12,
                       background: i === storyIdx ? "#ff9a3c" : "#5b6472", pointerEvents: "none" }} />
          ))}
        </div>
        {tickerText && (
          <div className="flex items-center gap-1.5 shrink-0" title="Ticker speed & color">
            <span className="text-[11px] text-gray-500">Ticker</span>
            <input type="range" min={6} max={60} step={1} value={66 - tickerSpeed}
              onChange={(e) => { const v = 66 - parseInt(e.target.value, 10); setTickerSpeed(v); onTickerSpeedChange && onTickerSpeedChange(v); }}
              className="w-20 accent-yellow-400" title="Speed (right = faster)" />
            <input type="color" value={tickerColor}
              onChange={(e) => { setTickerColor(e.target.value); onTickerColorChange && onTickerColorChange(e.target.value); }}
              className="w-6 h-6 rounded border border-gray-700 bg-transparent p-0 cursor-pointer" title="Ticker color" />
          </div>
        )}
        <span className="text-[11px] text-gray-500 shrink-0">
          Story {storyIdx + 1}/{stories.length || 1} · live preview
        </span>
      </div>
    </div>
  );
}
