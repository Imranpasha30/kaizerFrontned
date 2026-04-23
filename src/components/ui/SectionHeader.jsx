import React from "react";

/**
 * SectionHeader — the standard hero row used across landing-style sections.
 * Eyebrow · Heading · Lede · Optional CTA cluster (right side on desktop).
 */
export default function SectionHeader({
  eyebrow,
  title,
  lede,
  align = "center",
  actions,
}) {
  const alignClass =
    align === "left"
      ? "items-start text-left"
      : "items-center text-center";
  return (
    <div className={`flex flex-col ${alignClass} gap-3`}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      {title ? (
        <h2 className="heading-hero text-3xl md:text-4xl lg:text-5xl max-w-3xl">
          {title}
        </h2>
      ) : null}
      {lede ? <p className="lede max-w-2xl">{lede}</p> : null}
      {actions ? <div className="flex flex-wrap gap-3 mt-2">{actions}</div> : null}
    </div>
  );
}
