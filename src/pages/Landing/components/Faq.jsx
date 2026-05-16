import React, { useState } from "react";
import Reveal from "../fx/Reveal";

/**
 * Faq — 6 Q/A pairs. Newspaper renders inline "Q. ... A. ..."
 * editorial style; modern renders an accordion.
 */
export default function Faq({ mode, content }) {
  const f = content.faq;
  const [open, setOpen] = useState(null);
  const isNewspaper = mode === "newspaper";

  return (
    <section id="faq" className={`ls-faq ls-faq--${mode}`}>
      <Reveal>
        <header className="ls-section-head">
          <div className="ls-eyebrow">{f.eyebrow}</div>
        </header>
      </Reveal>

      <div className="ls-faq__list">
        {f.items.map((item, i) => {
          const isOpen = open === i;
          if (isNewspaper) {
            // Editorial: always open, Q. / A. format inline
            return (
              <article key={i} className="ls-faq__row ls-faq__row--editorial">
                <div className="ls-faq__q">
                  <span className="ls-faq__marker">Q.</span> {item.q}
                </div>
                <div className="ls-faq__a">
                  <span className="ls-faq__marker">A.</span> {item.a}
                </div>
              </article>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className={`ls-faq__row ls-faq__row--accordion ${isOpen ? "is-open" : ""}`}
              aria-expanded={isOpen}
            >
              <div className="ls-faq__q">
                <span className="ls-faq__chev" aria-hidden>{isOpen ? "–" : "+"}</span>
                {item.q}
              </div>
              {isOpen && <div className="ls-faq__a">{item.a}</div>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
