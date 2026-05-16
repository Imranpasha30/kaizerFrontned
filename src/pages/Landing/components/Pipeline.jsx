import React from "react";
import Reveal from "../fx/Reveal";

/**
 * Pipeline — 4-stage diagram. No "AI" anywhere; the engine is just
 * "the engine" and stages have status timecodes.
 *
 *  newspaper: numbered editorial blocks (§ II.1 … § II.4)
 *  modern:    horizontal stage cards with cyan timecode chips
 */
export default function Pipeline({ mode, content }) {
  const p = content.pipeline;
  return (
    <section id="pipeline" className={`ls-pipeline ls-pipeline--${mode}`}>
      <Reveal>
        <header className="ls-section-head">
          <div className="ls-eyebrow">{p.eyebrow}</div>
          <h2 className="ls-section-title">{p.title}</h2>
          <p className="ls-section-sub">{p.subtitle}</p>
        </header>
      </Reveal>

      <ol className="ls-pipeline__grid">
        {p.stages.map((s, i) => (
          <Reveal key={s.n} as="li" delay={120 + i * 90} className="ls-pipeline__stage">
            <div className="ls-pipeline__stage-head">
              <span className="ls-pipeline__n">{s.n}</span>
              <span className="ls-pipeline__t">{s.t}</span>
            </div>
            <h3 className="ls-pipeline__stage-title">{s.title}</h3>
            <p className="ls-pipeline__stage-body">{s.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
