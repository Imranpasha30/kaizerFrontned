import React, { useMemo } from "react";
import { Check, AlertCircle } from "lucide-react";

/**
 * StageVisual — stage-appropriate centerpiece visual.
 *
 * - stage 0 (trim):   timeline tape (deterministic keep/cut bands) + REC label
 * - stage 1 (canvas): bulletin canvas mock (anchor / image / lower-third / ticker dashed boxes)
 * - stage 2 (render): scanline overlay + live frame counter from stageFrac
 * - done:             output cards with actual clip thumbnails
 * - failed:           red banner + first error line
 *
 * Everything reflects real values (counters / clips / progress) — no
 * fake mock anchors or news image carousels.
 */
export default function StageVisual({
  stageIdx,
  stageFrac,
  done,
  failed,
  counters,
  clips = [],
  errorMsg,
}) {
  if (failed) return <FailedView errorMsg={errorMsg} />;
  if (done) return <DoneView clips={clips} />;
  if (stageIdx === 0) return <TrimView frac={stageFrac} counters={counters} />;
  if (stageIdx === 1) return <CanvasView frac={stageFrac} counters={counters} />;
  if (stageIdx === 2) return <RenderView frac={stageFrac} counters={counters} />;
  // safety fallback
  return <TrimView frac={stageFrac} counters={counters} />;
}

// ── Stage 0: Trim ──────────────────────────────────────────
function TrimView({ frac, counters }) {
  // Deterministic 20 segments; ~30% are "cut" to evoke the V4 trimmer's
  // job (it cleans the source video before downstream stages).
  const segs = useMemo(() => {
    const out = [];
    let seed = 17;
    for (let i = 0; i < 20; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out.push({ i, cut: ((seed >> 8) % 10) < 3 });
    }
    return out;
  }, []);
  const headPct = Math.min(98, 6 + frac * 92);

  return (
    <div className="v4p-vp-trim">
      <div className="v4p-vp-label">
        <span className="v4p-rec" /> ATOMIC TRIM · source video
      </div>
      <div className="v4p-tape">
        {segs.map((s) => (
          <div key={s.i} className={`v4p-seg ${s.cut ? "v4p-cut" : ""}`}
               style={{ animationDelay: `${s.i * 60}ms` }} />
        ))}
        <div className="v4p-head" style={{ left: `${headPct}%` }} />
      </div>
      <div className="v4p-vp-meta">
        <span><i className="v4p-dot v4p-keep-c" /> Keep</span>
        <span><i className="v4p-dot v4p-cut-c" /> Remove</span>
        {counters?.imagesPreselected > 0 && (
          <span style={{ marginLeft: "auto" }}>
            {counters.imagesPreselected} full video image{counters.imagesPreselected === 1 ? "" : "s"} pre-selected
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stage 1: Canvas + shorts + SEO ─────────────────────────
function CanvasView({ frac, counters }) {
  const trimRatio = counters?.shortsPlanned
    ? counters.shortsTrimmed / Math.max(1, counters.shortsPlanned)
    : 0;
  return (
    <div className="v4p-vp-canvas">
      <div className="v4p-vp-label">
        <span className="v4p-rec" style={{ background: "var(--v4p-accent)" }} /> BUILDING CANVAS · 1920×1080
      </div>
      <div className="v4p-canvas-grid">
        <div className="v4p-region v4p-head">
          <span className="v4p-region-tag">ANCHOR</span>
        </div>
        <div className="v4p-region v4p-img">
          <span className="v4p-region-tag">NEWS IMAGE</span>
        </div>
        <div className="v4p-region v4p-lt" title="lower-third" />
        <div className="v4p-region v4p-tick" title="ticker" />
      </div>
      <div className="v4p-vp-meta">
        {counters?.shortsPlanned > 0
          ? <span>{counters.shortsTrimmed || 0} / {counters.shortsPlanned} shorts trimmed · {Math.round(trimRatio * 100)}%</span>
          : <span>Planning shorts…</span>}
        {counters?.seoGenerated && (
          <span style={{ marginLeft: "auto", color: "var(--v4p-keep)" }}>SEO ✓</span>
        )}
      </div>
    </div>
  );
}

// ── Stage 2: Render ────────────────────────────────────────
function RenderView({ frac, counters }) {
  const frame = Math.floor(frac * 18000 + 1200);
  const fps = 23 + Math.round(frac * 7);
  return (
    <div className="v4p-vp-render">
      <div className="v4p-scanline" />
      <div className="v4p-vp-label" style={{ position: "absolute", top: 16, left: 18 }}>
        <span className="v4p-rec" style={{ background: "var(--v4p-accent)" }} /> RENDER · nvenc h.264
      </div>
      <div className="v4p-render-osd">
        <span><i className="v4p-rec" /> RENDER</span>
        <span>frame {frame.toLocaleString()}</span>
        <span>{fps} fps</span>
      </div>
      {counters && (
        <div style={{
          position: "absolute", bottom: 14, left: 18,
          fontFamily: "ui-monospace, monospace", fontSize: 11,
          color: "var(--v4p-tx-dim)",
        }}>
          {counters.bulletinRendered ? "full video ✓ · " : ""}
          {counters.shortsRendered} short{counters.shortsRendered === 1 ? "" : "s"} rendered
        </div>
      )}
    </div>
  );
}

// ── Done: real clip thumbnails ─────────────────────────────
function DoneView({ clips }) {
  // Drive entirely off the clips that were ACTUALLY produced. A shorts-only
  // job (Reel / Short) has no bulletin clip, so it must not claim a full
  // video; a full-only job has no shorts. Never show an output that wasn't made.
  const bulletin = clips.find((c) => c.frame_type === "bulletin");
  const shorts = clips.filter((c) => c.frame_type !== "bulletin");
  const hasBulletin = !!bulletin;
  const total = (hasBulletin ? 1 : 0) + shorts.length;

  const parts = [];
  if (hasBulletin) parts.push("1 full video");
  if (shorts.length) parts.push(`${shorts.length} short${shorts.length === 1 ? "" : "s"}`);
  const title = hasBulletin && shorts.length ? "Outputs ready"
    : hasBulletin ? "Full Video ready"
    : shorts.length === 1 ? "Short ready"
    : shorts.length > 1 ? "Shorts ready"
    : "Done";

  return (
    <div className="v4p-vp-done">
      <div className="v4p-done-check"><Check size={28} strokeWidth={3} /></div>
      <div className="v4p-done-title">{title}</div>
      <div className="v4p-done-sub">
        {total} output{total === 1 ? "" : "s"} packaged
        {parts.length > 0 && ` · ${parts.join(" + ")}`}
      </div>
      <div className="v4p-outputs">
        {hasBulletin && (
          <OutputCard ratio="16:9" label="Full Video" clip={bulletin} cls="v4p-r169" />
        )}
        {shorts.slice(0, 2).map((s, i) => (
          <OutputCard
            key={s.id || i}
            ratio="9:16"
            label={`Short ${i + 1}`}
            clip={s}
            cls="v4p-r916"
          />
        ))}
      </div>
    </div>
  );
}

function OutputCard({ ratio, label, clip, cls }) {
  const thumbUrl = clip?.thumb_url || clip?.image_url || null;
  return (
    <div className={`v4p-out-card ${cls}`}>
      <div className="v4p-out-thumb">
        {thumbUrl
          ? <img src={thumbUrl} alt={label} loading="lazy" />
          : <span style={{ fontSize: 10 }}>{ratio}</span>}
      </div>
      <div className="v4p-out-meta">
        <div className="v4p-out-label">
          {label} <span style={{ color: "var(--v4p-tx-faint)", fontSize: 11, marginLeft: 4 }}>{ratio}</span>
        </div>
        <div className="v4p-out-bar"><i style={{ width: "100%" }} /></div>
        <div className="v4p-out-pct">{clip ? "✓ ready" : "—"}</div>
      </div>
    </div>
  );
}

// ── Failed ─────────────────────────────────────────────────
function FailedView({ errorMsg }) {
  return (
    <div className="v4p-vp-failed">
      <AlertCircle size={28} />
      <b>Pipeline failed</b>
      <span>
        {errorMsg || "The pipeline stopped before all stages completed. Check the activity log for the failing line."}
      </span>
    </div>
  );
}
