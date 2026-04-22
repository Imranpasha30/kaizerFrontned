import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Wand2, AlertTriangle, CheckCircle } from "lucide-react";
import { api } from "../api/client";
import { editorApi } from "../api/client";
import StylePackCard from "../components/StylePackCard";
import SyncedVideoPair from "../components/SyncedVideoPair";

const PLATFORM_OPTIONS = [
  { value: "youtube_short",   label: "YouTube Short" },
  { value: "instagram_reel",  label: "Instagram Reel" },
  { value: "youtube_full",    label: "YouTube Full" },
  { value: "tiktok",          label: "TikTok" },
];

/* Fallback style packs shown if the API returns nothing yet */
const FALLBACK_STYLES = [
  {
    name: "minimal",
    label: "Minimal",
    description: "Clean cuts, no distractions",
    transition: "fade",
    color_preset: "neutral",
    motion: "static",
    text_animation: "fade_in",
    caption_animation: "simple",
  },
  {
    name: "cinematic",
    label: "Cinematic",
    description: "Warm tones, cinematic depth",
    transition: "cross_dissolve",
    color_preset: "cinematic_warm",
    motion: "ken_burns_in",
    text_animation: "fade_up",
    caption_animation: "word_pop",
  },
  {
    name: "news_flash",
    label: "News Flash",
    description: "Bold, urgent energy",
    transition: "wipe_right",
    color_preset: "news_red",
    motion: "zoom_in",
    text_animation: "bounce_in",
    caption_animation: "flash",
  },
  {
    name: "vibrant",
    label: "Vibrant",
    description: "Pop colours, high energy",
    transition: "slide_up",
    color_preset: "vibrant_pop",
    motion: "pan_left",
    text_animation: "scale_pop",
    caption_animation: "rainbow",
  },
  {
    name: "calm",
    label: "Calm",
    description: "Soft, reassuring mood",
    transition: "dissolve",
    color_preset: "cool_blue",
    motion: "slow_zoom",
    text_animation: "gentle_fade",
    caption_animation: "typewriter",
  },
];

export default function EditorBeta() {
  const { jobId, clipId } = useParams();

  const [clip,       setClip]       = useState(null);
  const [styles,     setStyles]     = useState([]);
  const [selected,   setSelected]   = useState("cinematic");
  const [hookText,   setHookText]   = useState("");
  const [platform,   setPlatform]   = useState("youtube_short");
  const [rendering,  setRendering]  = useState(false);
  const [result,     setResult]     = useState(null);
  const [lastCached, setLastCached] = useState(null);
  const [loadError,  setLoadError]  = useState("");
  const [renderError,setRenderError]= useState("");

  /* ── on mount: fetch clip + styles + any cached render ── */
  useEffect(() => {
    async function init() {
      try {
        const [clipData, stylesData] = await Promise.all([
          api.getClip(clipId),
          editorApi.listStyles().catch(() => []),
        ]);
        setClip(clipData);
        setStyles(stylesData && stylesData.length ? stylesData : FALLBACK_STYLES);
      } catch (e) {
        setLoadError(e.message || "Failed to load clip");
      }

      // Try loading a prior cached render — 404 is normal, just ignore it
      try {
        const cached = await editorApi.getLastRender(clipId);
        if (cached) {
          setLastCached(cached);
          // Pre-select the style that was used last time
          if (cached.style_pack?.name) setSelected(cached.style_pack.name);
        }
      } catch {
        /* no cached render — that's fine */
      }
    }
    init();
  }, [clipId]);

  /* ── render beta ──────────────────────────────────────── */
  const handleRender = useCallback(async () => {
    if (rendering) return;
    setRendering(true);
    setRenderError("");
    try {
      const body = {
        clip_id:    clipId,
        style_pack: selected,
        ...(hookText.trim() ? { hook_text: hookText.trim() } : {}),
        platform,
      };
      const res = await editorApi.renderBeta(body);
      setResult(res);
      setLastCached(res);
    } catch (e) {
      setRenderError(e.message || "Render failed — try again");
    } finally {
      setRendering(false);
    }
  }, [clipId, selected, hookText, platform, rendering]);

  /* ── derive display values ────────────────────────────── */
  const activeResult  = result || lastCached;
  const currentUrl    = activeResult?.current_url  ? api.mediaUrl(activeResult.current_url)  : null;
  const betaUrl       = activeResult?.beta_url     ? api.mediaUrl(activeResult.beta_url)     : null;
  const effectsApplied= activeResult?.effects_applied || [];
  const renderTimeS   = activeResult?.render_time_s;
  const qaOk          = activeResult?.qa_ok;
  const warnings      = activeResult?.warnings || [];
  const displayStyles = styles.length ? styles : FALLBACK_STYLES;

  /* ── loading state ────────────────────────────────────── */
  if (!clip && !loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="editor-beta-page">
      {/* ── Page header ──────────────────────────────────── */}
      <div className="eb-header">
        <Link to={`/jobs/${jobId}/edit/${clipId}`} className="btn btn-secondary eb-back-btn">
          <ArrowLeft size={14} />
          <span>Editor</span>
        </Link>

        <div className="eb-title-group">
          <h1 className="eb-title">
            EDITOR
            <span className="eb-page-badge">BETA</span>
          </h1>
          {clip && (
            <p className="eb-subtitle">{clip.filename || `Clip #${clipId}`}</p>
          )}
        </div>

        {loadError && (
          <p className="eb-load-error">
            <AlertTriangle size={14} /> {loadError}
          </p>
        )}
      </div>

      {/* ── Style pack picker ────────────────────────────── */}
      <section className="eb-section">
        <h2 className="eb-section-title">Pick a style</h2>
        <div className="style-pack-row" role="listbox" aria-label="Style packs">
          {displayStyles.map(pack => (
            <StylePackCard
              key={pack.name}
              pack={pack}
              selected={selected === pack.name}
              onSelect={() => setSelected(pack.name)}
            />
          ))}
        </div>
      </section>

      {/* ── Hook text + platform + render button ──────────── */}
      <section className="eb-section">
        <div className="eb-controls-row">
          <div className="eb-control-group">
            <label className="eb-label" htmlFor="hookText">Hook text</label>
            <input
              id="hookText"
              type="text"
              className="eb-input"
              placeholder="Optional opening text overlay…"
              value={hookText}
              onChange={e => setHookText(e.target.value)}
            />
          </div>

          <div className="eb-control-group eb-control-group--sm">
            <label className="eb-label" htmlFor="platform">Platform</label>
            <select
              id="platform"
              className="eb-select"
              value={platform}
              onChange={e => setPlatform(e.target.value)}
            >
              {PLATFORM_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {renderError && (
          <p className="eb-render-error">
            <AlertTriangle size={14} /> {renderError}
          </p>
        )}

        <div className="eb-render-btn-row">
          <button
            type="button"
            className={`btn btn-beta eb-render-btn${rendering ? " eb-render-btn--loading" : ""}`}
            onClick={handleRender}
            disabled={rendering}
          >
            {rendering ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Rendering…</span>
              </>
            ) : (
              <>
                <Wand2 size={16} />
                <span>Render Beta</span>
                <span className="beta-badge">NEW</span>
              </>
            )}
          </button>
          {lastCached && !result && (
            <p className="eb-cached-note">Showing last cached render. Hit Render Beta to refresh.</p>
          )}
        </div>
      </section>

      {/* ── Side-by-side video comparison ─────────────────── */}
      <section className="eb-section">
        <h2 className="eb-section-title">Compare</h2>
        <div className={`eb-result-area${activeResult ? " eb-result-area--visible" : ""}`}>
          <SyncedVideoPair
            leftSrc={currentUrl}
            rightSrc={betaUrl}
            leftLabel="CURRENT (no effects)"
            rightLabel="BETA (with effects)"
          />
        </div>

        {!activeResult && !rendering && (
          <div className="eb-empty-compare">
            <Wand2 size={32} className="eb-empty-icon" />
            <p>Pick a style and click <strong>Render Beta</strong> to compare</p>
          </div>
        )}
        {rendering && !activeResult && (
          <div className="eb-empty-compare">
            <Loader2 size={32} className="animate-spin eb-empty-icon" />
            <p>Rendering your beta clip… this may take 15–30s</p>
          </div>
        )}
      </section>

      {/* ── Effects + QA meta ─────────────────────────────── */}
      {activeResult && (
        <section className="eb-section eb-meta-section">
          {effectsApplied.length > 0 && (
            <div className="eb-effects-row">
              <span className="eb-meta-label">Applied:</span>
              {effectsApplied.map(fx => (
                <span key={fx} className="effect-chip">{fx}</span>
              ))}
            </div>
          )}

          <div className="eb-qa-row">
            {qaOk !== undefined && qaOk !== null && (
              <span className={`eb-qa-pill ${qaOk ? "eb-qa-pill--ok" : "eb-qa-pill--warn"}`}>
                {qaOk
                  ? <><CheckCircle size={12} /> QA: ok</>
                  : <><AlertTriangle size={12} /> QA: issues</>}
              </span>
            )}
            {renderTimeS != null && (
              <span className="eb-render-time">
                Rendered in {Number(renderTimeS).toFixed(1)}s
              </span>
            )}
            {warnings.map((w, i) => (
              <span key={i} className="eb-warning-pill">
                <AlertTriangle size={12} /> {w}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
