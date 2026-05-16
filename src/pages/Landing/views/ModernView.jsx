import React, { useEffect, useState } from "react";
import Hero      from "../components/Hero";
import Pipeline  from "../components/Pipeline";
import Stats     from "../components/Stats";
import Trust     from "../components/Trust";
import Pricing   from "../components/PricingTable";
import Faq       from "../components/Faq";
import Closing   from "../components/Closing";
import Footer    from "../components/Footer";
import LivingCursor    from "../fx/LivingCursor";
import Atmosphere      from "../fx/Atmosphere";
import ReadingBar      from "../fx/ReadingBar";

/**
 * ModernView — v6 visual frame:
 *   - Top HUD with timecode + scene label that updates as the user
 *     scrolls past each section
 *   - Marquee strip under the hero
 *   - Body sections (Hero, Pipeline, Stats, Trust, Pricing, Faq,
 *     Closing) — same data as NewspaperView, different styling
 *   - Footer
 */
export default function ModernView({ content }) {
  const sections = content.sections;
  const [currentSection, setCurrentSection] = useState(sections[0]?.id);
  const [timecode, setTimecode] = useState("T+00:00:00");

  useEffect(() => {
    // T+ timecode ticks since page mount — purely cosmetic HUD
    const start = Date.now();
    const tcTimer = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      const hh = String(Math.floor(s / 3600)).padStart(2, "0");
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setTimecode(`T+${hh}:${mm}:${ss}`);
    }, 1000);
    return () => clearInterval(tcTimer);
  }, []);

  useEffect(() => {
    function onScroll() {
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

  const currentSec = sections.find((s) => s.id === currentSection) || sections[0];

  return (
    <div className="ls-modern">
      <LivingCursor />
      <Atmosphere />
      <ReadingBar />

      {/* HUD: timecode + active scene label */}
      <header className="ls-hud" aria-hidden>
        <div className="ls-hud__timecode">{timecode}</div>
        <div className="ls-hud__scene">
          {currentSec?.numeral} · {currentSec?.label?.toUpperCase()}
        </div>
        <div className="ls-hud__edition">LIVE EDITION</div>
      </header>

      <main className="ls-void">
        <Hero mode="modern" content={content} />

        {/* Marquee strip under hero */}
        <div className="ls-marquee" aria-hidden>
          <div className="ls-marquee__track">
            <span>INGEST</span><span>·</span>
            <span>ANALYZE</span><span>·</span>
            <span>CUT</span><span>·</span>
            <span>PUBLISH</span><span>·</span>
            <span>SLEEP</span><span>·</span>
            {/* repeat once for seamless loop */}
            <span>INGEST</span><span>·</span>
            <span>ANALYZE</span><span>·</span>
            <span>CUT</span><span>·</span>
            <span>PUBLISH</span><span>·</span>
            <span>SLEEP</span><span>·</span>
          </div>
        </div>

        <Pipeline  mode="modern" content={content} />
        <Stats     mode="modern" content={content} />
        <Trust     mode="modern" content={content} />
        <Pricing   mode="modern" content={content} />
        <Faq       mode="modern" content={content} />
        <Closing   mode="modern" content={content} />
      </main>

      <Footer mode="modern" content={content} />
    </div>
  );
}
