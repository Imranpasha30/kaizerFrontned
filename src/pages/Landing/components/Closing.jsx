import React from "react";
import { Link } from "react-router-dom";
import Reveal from "../fx/Reveal";

/**
 * Closing — bottom CTA. Drives users into /register.
 */
export default function Closing({ mode, content }) {
  const c = content.closing;
  return (
    <section id="closing" className={`ls-closing ls-closing--${mode}`}>
      <Reveal>
        <div className="ls-eyebrow">{c.eyebrow}</div>
      </Reveal>
      <Reveal delay={80}>
        <h2 className="ls-section-title ls-closing__title">{c.title}</h2>
      </Reveal>
      <Reveal delay={160}>
        <p className="ls-closing__body">{c.body}</p>
      </Reveal>
      <Reveal delay={240}>
        <div className="ls-closing__ctas">
          <Link to={c.primaryCta.to}   className="ls-btn ls-btn--primary">
            {c.primaryCta.label}
          </Link>
          <Link to={c.secondaryCta.to} className="ls-btn ls-btn--ghost">
            {c.secondaryCta.label}
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
