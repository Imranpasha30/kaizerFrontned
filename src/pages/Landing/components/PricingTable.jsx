import React from "react";
import { Link } from "react-router-dom";
import Reveal from "../fx/Reveal";

/**
 * PricingTable — 4 tiers, Postiz-anchored. Featured tier ("Pro")
 * gets visual highlight per mode.
 */
export default function PricingTable({ mode, content }) {
  const p = content.pricing;
  return (
    <section id="pricing" className={`ls-pricing ls-pricing--${mode}`}>
      <Reveal>
        <header className="ls-section-head">
          <div className="ls-eyebrow">{p.eyebrow}</div>
          <h2 className="ls-section-title">{p.title}</h2>
          <p className="ls-section-sub">{p.subtitle}</p>
        </header>
      </Reveal>

      <div className="ls-pricing__grid">
        {p.tiers.map((t, idx) => (
          <Reveal
            key={t.name}
            delay={120 + idx * 90}
            className={`ls-pricing__tier ${t.featured ? "ls-pricing__tier--featured" : ""}`}
          >
            {t.featured && (
              <div className="ls-pricing__featured-tag">Most popular</div>
            )}
            <div className="ls-pricing__tier-name">{t.name}</div>
            <div className="ls-pricing__tier-price">
              <span className="ls-pricing__amount">{t.price}</span>
              <span className="ls-pricing__cycle">{t.cycle}</span>
            </div>
            <div className="ls-pricing__tier-blurb">{t.blurb}</div>
            <ul className="ls-pricing__features">
              {t.features.map((f, i) => (
                <li key={i} className="ls-pricing__feature">
                  <span className="ls-pricing__feature-bullet" aria-hidden>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {t.cta.to ? (
              <Link
                to={t.cta.to}
                className={`ls-btn ls-pricing__cta ${t.featured ? "ls-btn--primary" : "ls-btn--ghost"}`}
              >
                {t.cta.label}
              </Link>
            ) : (
              <a
                href={t.cta.href}
                className={`ls-btn ls-pricing__cta ${t.featured ? "ls-btn--primary" : "ls-btn--ghost"}`}
              >
                {t.cta.label}
              </a>
            )}
          </Reveal>
        ))}
      </div>

      <Reveal delay={520}>
        <p className="ls-pricing__note">{p.note}</p>
      </Reveal>
    </section>
  );
}
