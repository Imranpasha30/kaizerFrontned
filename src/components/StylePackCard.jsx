import React from "react";

/**
 * StylePackCard — Instagram-Reels-picker style card for a single style pack.
 *
 * Props:
 *   pack     {name, label, description, transition, color_preset, motion, text_animation, caption_animation}
 *   selected bool
 *   onSelect fn()
 */
export default function StylePackCard({ pack, selected, onSelect }) {
  if (!pack) return null;

  const chips = [
    pack.transition      && { key: "transition",  label: pack.transition },
    pack.motion          && { key: "motion",       label: pack.motion },
    pack.text_animation  && { key: "text",         label: pack.text_animation },
    pack.caption_animation && { key: "caption",    label: pack.caption_animation },
  ].filter(Boolean);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`style-pack-card${selected ? " selected" : ""}`}
      data-pack={pack.name}
    >
      {/* Top: large label */}
      <div className="style-pack-card__label">{pack.label || pack.name}</div>

      {/* Middle: description */}
      <div className="style-pack-card__desc">
        {pack.description || ""}
      </div>

      {/* Bottom: tiny effect chips */}
      <div className="style-pack-card__chips">
        {chips.map(({ key, label }) => (
          <span key={key} className="style-pack-chip">{label}</span>
        ))}
      </div>
    </button>
  );
}
