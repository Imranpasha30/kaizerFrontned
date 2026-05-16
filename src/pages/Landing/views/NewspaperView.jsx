import React, { useEffect, useState } from "react";
import Hero      from "../components/Hero";
import Pipeline  from "../components/Pipeline";
import Stats     from "../components/Stats";
import Trust     from "../components/Trust";
import Pricing   from "../components/PricingTable";
import Faq       from "../components/Faq";
import Closing   from "../components/Closing";
import Footer    from "../components/Footer";
import NibCursor   from "../fx/NibCursor";
import ReadingBar  from "../fx/ReadingBar";
import ReaderTools from "../fx/ReaderTools";

/**
 * NewspaperView — v7 visual frame:
 *   - Masthead (publication name + edition + volume)
 *   - Banner with side metadata boxes
 *   - Subnav (§I–§VII)
 *   - Scrolling ticker
 *   - Body sections (Hero, Pipeline, Stats, Trust, Pricing, Faq, Closing)
 *   - Folio (fixed-right page counter + scroll progress)
 *   - Footer
 */
export default function NewspaperView({ content }) {
  const sections   = content.sections;
  const m          = content.masthead;
  const [scrollPct, setScrollPct] = useState(0);
  const [currentSection, setCurrentSection] = useState(sections[0]?.id);

  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setScrollPct(max > 0 ? Math.min(100, (doc.scrollTop / max) * 100) : 0);

      // Detect which section is currently centered.
      let best = sections[0]?.id;
      const midY = window.innerHeight / 2;
      for (const sec of sections) {
        const el = document.getElementById(sec.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= midY) best = sec.id;
      }
      setCurrentSection(best);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  return (
    <div className="ls-newspaper">
      <NibCursor />
      <ReadingBar />
      <ReaderTools />

      {/* Masthead */}
      <header className="ls-masthead">
        <div className="ls-masthead__row">
          <div className="ls-masthead__edition">{m.edition}</div>
          <div className="ls-masthead__tagline">{m.tagline}</div>
        </div>
        <h1 className="ls-masthead__title">{m.publication}</h1>
        <div className="ls-masthead__meta-row">
          {m.metaBoxes.map((b) => (
            <div key={b.label} className="ls-masthead__meta">
              <div className="ls-masthead__meta-label">{b.label}</div>
              <div className="ls-masthead__meta-value">{b.value}</div>
            </div>
          ))}
        </div>
      </header>

      {/* Subnav §I–§VII */}
      <nav className="ls-subnav" aria-label="Sections">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`ls-subnav__link ${currentSection === s.id ? "is-current" : ""}`}
          >
            <span className="ls-subnav__numeral">{s.numeral}</span> {s.label}
          </a>
        ))}
      </nav>

      {/* Ticker */}
      <div className="ls-ticker" aria-hidden>
        <div className="ls-ticker__track">
          <span>Uptime 99.97%</span>
          <span>·</span>
          <span>Clips shipped today: live counter</span>
          <span>·</span>
          <span>OAuth-only · YouTube Data v3</span>
          <span>·</span>
          <span>Limited Use compliant</span>
          <span>·</span>
          <span>From $29/mo · Cancel anytime</span>
          <span>·</span>
          {/* repeat once for seamless loop */}
          <span>Uptime 99.97%</span>
          <span>·</span>
          <span>Clips shipped today: live counter</span>
          <span>·</span>
          <span>OAuth-only · YouTube Data v3</span>
          <span>·</span>
          <span>Limited Use compliant</span>
          <span>·</span>
          <span>From $29/mo · Cancel anytime</span>
        </div>
      </div>

      <main className="ls-paper">
        <Hero      mode="newspaper" content={content} />
        <Pipeline  mode="newspaper" content={content} />
        <Stats     mode="newspaper" content={content} />
        <Trust     mode="newspaper" content={content} />
        <Pricing   mode="newspaper" content={content} />
        <Faq       mode="newspaper" content={content} />
        <Closing   mode="newspaper" content={content} />
      </main>

      <Footer mode="newspaper" content={content} />

      {/* Folio (fixed right) — page counter + reading bar */}
      <aside className="ls-folio" aria-hidden>
        <div className="ls-folio__page">
          {sections.findIndex((s) => s.id === currentSection) + 1}
          <span className="ls-folio__total"> / {sections.length}</span>
        </div>
        <div className="ls-folio__bar">
          <div className="ls-folio__bar-fill" style={{ height: `${scrollPct}%` }} />
        </div>
      </aside>
    </div>
  );
}
