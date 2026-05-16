import React, { useEffect, useRef, useState } from "react";
import Reveal from "../fx/Reveal";

/**
 * Stats — 4 big animated counters. Same hook pattern the old
 * Landing.jsx used; inlined so the component is self-contained.
 */
function useCounter(target, { duration = 1400, decimals = 0 } = {}) {
  const ref = useRef(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    let raf, t0;
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const tick = (now) => {
          if (!t0) t0 = now;
          const p = Math.min(1, (now - t0) / duration);
          const cur = ease(p) * target;
          setV(decimals ? Number(cur.toFixed(decimals)) : Math.floor(cur));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        io.disconnect();
      });
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, duration, decimals]);
  return [ref, v];
}

function Figure({ value, suffix, label }) {
  const decimals = String(value).includes(".") ? 2 : 0;
  const [ref, cur] = useCounter(value, { decimals });
  return (
    <div ref={ref} className="ls-stat">
      <div className="ls-stat__value">
        {decimals ? cur.toFixed(decimals) : cur}{suffix}
      </div>
      <div className="ls-stat__label">{label}</div>
    </div>
  );
}

export default function Stats({ mode, content }) {
  const s = content.stats;
  return (
    <section id="stats" className={`ls-stats ls-stats--${mode}`}>
      <Reveal>
        <header className="ls-section-head">
          <div className="ls-eyebrow">{s.eyebrow}</div>
          <h2 className="ls-section-title">{s.title}</h2>
        </header>
      </Reveal>
      <div className="ls-stats__grid">
        {s.figures.map((f, i) => (
          <Reveal key={i} delay={80 + i * 90}>
            <Figure {...f} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
