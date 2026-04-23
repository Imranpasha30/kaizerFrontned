import React from "react";

/**
 * LayoutPreview — renders a miniature visual of a director layout, the way
 * Canva shows template previews. This is the "what does that layout look
 * like?" visual used across the app (director picker, logs, tooltips).
 *
 *   <LayoutPreview layout="split2_hstack" primary={0} size="md" />
 *
 * `primary` highlights one cell with the accent colour so viewers can see
 * which cam is the main feed in a multi-cam layout.
 *
 * Variants covered: single, split2_hstack, split2_vstack, pip, quad, bridge.
 * Unknown layouts fall back to the "single" preview so the UI never crashes.
 */
export default function LayoutPreview({
  layout = "single",
  primary = 0,
  size = "md",
  className = "",
}) {
  const style = sizeStyles[size] || sizeStyles.md;
  const cells = layoutCells(layout);
  const gridStyle = cells.gridStyle;

  return (
    <div
      className={`layout-tile-preview ${className}`.trim()}
      style={{ ...style, ...gridStyle }}
    >
      {cells.children.map((cell, i) => (
        <div
          key={i}
          className={`layout-tile-cell ${i === primary ? "layout-tile-cell--primary" : ""}`.trim()}
          style={cell.style}
        >
          {cell.label ? <CellLabel label={cell.label} /> : null}
        </div>
      ))}
      {layout === "bridge" ? <BridgeBadge /> : null}
    </div>
  );
}

function CellLabel({ label }) {
  return (
    <span
      className="absolute inset-x-0 bottom-1 text-center text-[9px] font-bold tracking-widest text-white/60 pointer-events-none uppercase"
    >
      {label}
    </span>
  );
}

function BridgeBadge() {
  return (
    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tracking-wider uppercase text-white/70 pointer-events-none">
      bridge
    </span>
  );
}

const sizeStyles = {
  sm: { width: "80px"  },
  md: { width: "140px" },
  lg: { width: "220px" },
  full: { width: "100%" },
};

/**
 * layoutCells → { gridStyle, children[] } describing the CSS grid that draws
 * the preview. Each child is a grid cell; its optional .style sets grid-area
 * for non-uniform layouts (pip, bridge).
 */
function layoutCells(layout) {
  switch (layout) {
    case "single":
      return {
        gridStyle: { gridTemplate: `"a" 1fr / 1fr` },
        children: [{ label: "cam 1" }],
      };
    case "split2_hstack":
      return {
        gridStyle: { gridTemplate: `"a b" 1fr / 1fr 1fr` },
        children: [{ label: "cam 1" }, { label: "cam 2" }],
      };
    case "split2_vstack":
      return {
        gridStyle: { gridTemplate: `"a" 1fr "b" 1fr / 1fr` },
        children: [{ label: "cam 1" }, { label: "cam 2" }],
      };
    case "pip":
      return {
        gridStyle: { gridTemplate: `"a a a" 1fr "a a b" 1fr / 1fr 1fr 1fr` },
        children: [
          { style: { gridArea: "a" }, label: "main" },
          { style: { gridArea: "b" }, label: "pip"  },
        ],
      };
    case "quad":
      return {
        gridStyle: { gridTemplate: `"a b" 1fr "c d" 1fr / 1fr 1fr` },
        children: [
          { label: "cam 1" }, { label: "cam 2" },
          { label: "cam 3" }, { label: "cam 4" },
        ],
      };
    case "bridge":
      return {
        gridStyle: { gridTemplate: `"a" 1fr / 1fr` },
        children: [{}],
      };
    default:
      return layoutCells("single");
  }
}

/**
 * LayoutPicker — a row/grid of LayoutPreview cards you can click to pick one.
 *   <LayoutPicker value={layout} onChange={setLayout} options={layouts} />
 */
export function LayoutPicker({
  value,
  onChange,
  options = DEFAULT_LAYOUT_OPTIONS,
  size = "md",
  className = "",
}) {
  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 ${className}`.trim()}
    >
      {options.map((opt) => {
        const selected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange?.(opt.id)}
            className={`layout-tile ${selected ? "layout-tile--selected" : ""}`.trim()}
            aria-pressed={selected}
          >
            <LayoutPreview layout={opt.id} size={size} />
            <div className="layout-tile-label">
              <span className="layout-tile-name">{opt.name}</span>
              {opt.badge ? (
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent2 border border-accent/30">
                  {opt.badge}
                </span>
              ) : null}
            </div>
            <p className="layout-tile-desc">{opt.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

export const DEFAULT_LAYOUT_OPTIONS = [
  {
    id: "single",
    name: "Single cam",
    desc: "One camera, full frame. The director switches between them on cut rules.",
  },
  {
    id: "split2_hstack",
    name: "Split · side by side",
    desc: "Two cams next to each other — perfect for joke → laugh and Q&A moments.",
    badge: "auto",
  },
  {
    id: "split2_vstack",
    name: "Split · stacked",
    desc: "Top/bottom split for portrait-style story telling.",
  },
  {
    id: "pip",
    name: "Picture-in-picture",
    desc: "Main cam fills the screen; a secondary cam floats in a corner.",
  },
  {
    id: "quad",
    name: "Quad 2×2",
    desc: "All four cameras at once — useful when several things happen in parallel.",
  },
  {
    id: "bridge",
    name: "Bridge · title card",
    desc: "Shown automatically when every camera goes quiet.",
    badge: "auto",
  },
];
