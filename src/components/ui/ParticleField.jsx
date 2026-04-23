import React, { useEffect, useRef } from "react";

/**
 * ParticleField — ambient canvas-based particle drift with constellation
 * lines between nearby particles. Intended as a subtle decorative layer
 * behind hero content.
 *
 *   <ParticleField density={40} className="absolute inset-0" />
 *
 * Respects prefers-reduced-motion — renders nothing (the parent can supply
 * a static fallback like a grid background) when reduced motion is on.
 */
export default function ParticleField({
  density = 40,
  color = "231,76,60",
  className = "",
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const particlesRef = useRef([]);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const reducedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    if (mq.matches) return; // no motion at all

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      const { w, h } = sizeRef.current;
      const list = [];
      for (let i = 0; i < density; i++) {
        list.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: 0.8 + Math.random() * 1.6,
          o: 0.08 + Math.random() * 0.17,
        });
      }
      particlesRef.current = list;
    }

    function step() {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);
      const ps = particlesRef.current;

      // update + draw particles
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.x += p.vx;
        p.y += p.vy;
        // wrap
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
        if (p.y < -4) p.y = h + 4;
        if (p.y > h + 4) p.y = -4;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${color},${p.o.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // constellation lines
      const MAX = 120;
      const MAX_SQ = MAX * MAX;
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i];
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MAX_SQ) {
            const t = 1 - d2 / MAX_SQ;
            ctx.strokeStyle = `rgba(${color},${(t * 0.12).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(step);
    }

    resize();
    seed();
    rafRef.current = requestAnimationFrame(step);

    const onResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [density, color]);

  // In reduced-motion, render nothing — parent is responsible for fallbacks.
  if (reducedRef.current) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
