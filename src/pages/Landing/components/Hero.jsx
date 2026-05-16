import React from "react";
import { Link } from "react-router-dom";
import EngineCore        from "../fx/EngineCore";
import { HeroAtmosphere } from "../fx/Atmosphere";
import Reveal            from "../fx/Reveal";

/**
 * Hero — used by both views, mode prop switches typography + layout.
 *
 *  newspaper: serif headline + 2-column standfirst, masthead-style eyebrow
 *  modern:    display sans + single standfirst, T+00:00:00 HUD eyebrow,
 *             rotating engine-core sphere on the right + beam/fog overlay
 *
 * Content always comes from LANDING_CONTENT.hero (single source).
 */
export default function Hero({ mode, content }) {
  const h = content.hero;
  const isNewspaper = mode === "newspaper";

  if (isNewspaper) {
    return (
      <section id="hero" className="ls-hero ls-hero--newspaper">
        <Reveal>
          <div className="ls-hero__eyebrow">{h.eyebrow}</div>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="ls-hero__headline">
            {h.headlineLines.map((line, i) => (
              <span key={i} className="ls-hero__line">{line}</span>
            ))}
          </h1>
        </Reveal>

        <Reveal delay={180}>
          <div className="ls-hero__standfirst-grid">
            <p className="ls-hero__standfirst">{h.standfirstLeft}</p>
            <p className="ls-hero__standfirst">{h.standfirstRight}</p>
          </div>
        </Reveal>

        <Reveal delay={260}>
          <div className="ls-hero__ctas">
            <Link to={h.primaryCta.to} className="ls-btn ls-btn--primary">
              {h.primaryCta.label}
            </Link>
            <a href={h.secondaryCta.href} className="ls-btn ls-btn--ghost">
              {h.secondaryCta.label}
            </a>
          </div>
        </Reveal>
      </section>
    );
  }

  // Modern hero — 2-column with rotating engine-core sphere on the right.
  return (
    <section id="hero" className="ls-hero ls-hero--modern">
      <HeroAtmosphere />

      <div className="ls-hero__cols">
        <div className="ls-hero__copy">
          <Reveal>
            <div className="ls-hero__eyebrow">{h.eyebrow}</div>
          </Reveal>

          <Reveal delay={100}>
            <h1 className="ls-hero__headline">
              {h.headlineLines.map((line, i) => (
                <span key={i} className="ls-hero__line">{line}</span>
              ))}
            </h1>
          </Reveal>

          <Reveal delay={220}>
            <p className="ls-hero__standfirst ls-hero__standfirst--solo">
              {h.standfirstLeft} {h.standfirstRight}
            </p>
          </Reveal>

          <Reveal delay={320}>
            <div className="ls-hero__ctas">
              <Link to={h.primaryCta.to} className="ls-btn ls-btn--primary">
                {h.primaryCta.label}
              </Link>
              <a href={h.secondaryCta.href} className="ls-btn ls-btn--ghost">
                {h.secondaryCta.label}
              </a>
            </div>
          </Reveal>
        </div>

        <div className="ls-hero__visual">
          <EngineCore />
        </div>
      </div>
    </section>
  );
}
