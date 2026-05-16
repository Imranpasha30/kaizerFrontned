import React from "react";

/**
 * Atmosphere — fixed scanline overlay + vignette + letterbox lines for
 * the modern view. The mesh/blur gradient is already on .ls-modern::before;
 * this component adds the cinematic decoration layered above content.
 */
export default function Atmosphere() {
  return (
    <>
      <div className="ls-atmos__scanlines" aria-hidden />
      <div className="ls-atmos__vignette" aria-hidden />
      <div className="ls-atmos__letterbox-top" aria-hidden />
      <div className="ls-atmos__letterbox-bot" aria-hidden />
    </>
  );
}

/**
 * HeroAtmosphere — beam + fog blobs scoped to the hero area only.
 * Rendered inside the .ls-hero--modern section.
 */
export function HeroAtmosphere() {
  return (
    <>
      <div className="ls-atmos__beam" aria-hidden />
      <div
        className="ls-atmos__fog"
        aria-hidden
        style={{ width: 600, height: 600, top: "-10%", left: "-10%" }}
      />
      <div
        className="ls-atmos__fog ls-atmos__fog--violet"
        aria-hidden
        style={{ width: 500, height: 500, bottom: "-15%", right: "-5%" }}
      />
    </>
  );
}
