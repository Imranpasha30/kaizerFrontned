import React from "react";
import Reveal from "../fx/Reveal";

/**
 * Trust — OAuth scope explainer + "what we don't do" list.
 *
 * This is the most YouTube-compliance-sensitive section. Names all
 * 3 OAuth scopes explicitly (matches /privacy disclosure) and uses
 * the "you approve every clip" language verbatim.
 */
export default function Trust({ mode, content }) {
  const t = content.trust;
  return (
    <section id="trust" className={`ls-trust ls-trust--${mode}`}>
      <Reveal>
        <header className="ls-section-head">
          <div className="ls-eyebrow">{t.eyebrow}</div>
          <h2 className="ls-section-title">{t.title}</h2>
          <p className="ls-section-sub">{t.intro}</p>
        </header>
      </Reveal>

      <div className="ls-trust__grid">
        {t.scopes.map((s, i) => (
          <Reveal key={s.code} delay={120 + i * 100} className="ls-trust__scope">
            <code className="ls-trust__code">{s.code}</code>
            <h3 className="ls-trust__scope-title">{s.title}</h3>
            <p className="ls-trust__scope-body">{s.body}</p>
          </Reveal>
        ))}
      </div>

      <Reveal delay={240}>
        <div className="ls-trust__wontdo">
          <h3 className="ls-trust__wontdo-title">{t.wontDo.title}</h3>
          <ul className="ls-trust__wontdo-list">
            {t.wontDo.items.map((item, i) => (
              <li key={i} className="ls-trust__wontdo-item">{item}</li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
