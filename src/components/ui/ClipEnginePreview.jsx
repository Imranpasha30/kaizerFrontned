import React from "react";

/**
 * ClipEnginePreview — an abstract, animated preview of what the AI Clip
 * Engine does: takes one long-form show (the top timeline) and spawns a
 * row of platform-sized clips (the tiles below). Matches the visual
 * vocabulary of LayoutPreview — dark cells, red primary accent, shimmer.
 *
 *   <ClipEnginePreview size="full" />
 *
 * The playhead sweeps across the source timeline on a 3s loop; each clip
 * tile rises with a staggered delay and shimmers subtly. Dashed vertical
 * guides link the playhead's current area back to the tile row so the
 * metaphor "these are cut from here" reads at a glance.
 */
export default function ClipEnginePreview({ size = "full", className = "" }) {
  const wrap = sizeStyles[size] || sizeStyles.full;

  const tiles = [
    { id: 0, format: "9:16", label: "REEL",  color: "#e74c3c", delay: 0   },
    { id: 1, format: "9:16", label: "REEL",  color: "#e74c3c", delay: 80  },
    { id: 2, format: "1:1",  label: "IG",    color: "#f39c12", delay: 160, live: true },
    { id: 3, format: "16:9", label: "SHORT", color: "#3aa0c9", delay: 240 },
    { id: 4, format: "16:9", label: "SHORT", color: "#3aa0c9", delay: 320 },
  ];

  return (
    <div
      className={`clip-engine-preview ${className}`.trim()}
      style={wrap}
      aria-hidden="true"
    >
      {/* Top 30% — source timeline */}
      <div className="cep-timeline">
        <div className="cep-timeline-bar">
          {/* segment ticks */}
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="cep-tick"
              style={{ left: `${(i + 0.5) * (100 / 12)}%` }}
            />
          ))}
          {/* scene blocks */}
          {[
            { l: 6,  w: 10, c: "rgba(231,76,60,0.35)" },
            { l: 22, w: 14, c: "rgba(243,156,18,0.32)" },
            { l: 42, w: 8,  c: "rgba(58,160,201,0.32)" },
            { l: 58, w: 16, c: "rgba(231,76,60,0.28)" },
            { l: 80, w: 12, c: "rgba(243,156,18,0.30)" },
          ].map((b, i) => (
            <span
              key={i}
              className="cep-scene"
              style={{ left: `${b.l}%`, width: `${b.w}%`, background: b.c }}
            />
          ))}
          {/* waveform hint */}
          <div className="cep-wave" aria-hidden="true" />
          {/* playhead */}
          <span className="cep-playhead" />
        </div>
        <div className="cep-timeline-meta">
          <span className="cep-meta-label">SOURCE · 01:24:33</span>
          <span className="cep-meta-label cep-meta-label--live">
            <span className="cep-meta-dot" />
            SCANNING
          </span>
        </div>
      </div>

      {/* Dashed guides linking timeline → tiles */}
      <div className="cep-guides" aria-hidden="true">
        {[18, 34, 50, 66, 82].map((x, i) => (
          <span
            key={i}
            className="cep-guide"
            style={{ left: `${x}%`, animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>

      {/* Bottom 70% — clip tiles */}
      <div className="cep-tiles">
        {tiles.map((t) => (
          <ClipTile key={t.id} tile={t} />
        ))}
      </div>
    </div>
  );
}

function ClipTile({ tile }) {
  const { format, label, color, delay, live } = tile;
  const aspectClass =
    format === "9:16" ? "cep-tile--portrait" :
    format === "1:1"  ? "cep-tile--square"   :
                        "cep-tile--wide";

  return (
    <div
      className={`cep-tile ${aspectClass}`}
      style={{
        animationDelay: `${delay}ms`,
        "--tile-accent": color,
      }}
    >
      {/* tile inner art: gradient + shimmer sweep */}
      <div className="cep-tile-art">
        <div className="cep-tile-art-bars" aria-hidden="true">
          <span style={{ height: "48%" }} />
          <span style={{ height: "72%" }} />
          <span style={{ height: "36%" }} />
          <span style={{ height: "60%" }} />
          <span style={{ height: "82%" }} />
        </div>
      </div>

      {/* platform label */}
      <span className="cep-tile-chip">{label}</span>
      {/* aspect badge */}
      <span className="cep-tile-aspect">{format}</span>
      {/* live dot — only on one tile */}
      {live ? <span className="cep-tile-live" /> : null}
    </div>
  );
}

const sizeStyles = {
  sm:   { width: "240px" },
  md:   { width: "360px" },
  lg:   { width: "520px" },
  full: { width: "100%" },
};
