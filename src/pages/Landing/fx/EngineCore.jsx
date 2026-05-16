import React, { useEffect, useRef, useState } from "react";

/**
 * EngineCore — the rotating sphere we render on the hero in modern view.
 *
 * Pure CSS + SVG (no Three.js). Three concentric rings spin at different
 * speeds, twenty-four background particles twinkle, six dashed connector
 * lines wobble with cursor position to give a parallax-feel without
 * actual 3D math.
 *
 * The wrapper has `.ls-huge-target` so LivingCursor grows when hovered.
 *
 * Compliance note: this is the "engine core" — same visual the v6 mock
 * called the AI core, renamed for the landing per the wording sweep.
 */
export default function EngineCore() {
  const wrapRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (window.matchMedia("(pointer:coarse)").matches) return;
    function onMove(e) {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / r.width;
      const y = (e.clientY - (r.top + r.height / 2)) / r.height;
      setCoords({ x, y });
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const { x, y } = coords;
  const orbits = [
    { rx: 48, color: "var(--cyan)"   },
    { rx: 40, color: "#7C5BFF"       },
    { rx: 54, color: "#F5E6C8"       },
  ];

  return (
    <div
      ref={wrapRef}
      className="ls-core ls-huge-target"
      data-cursor="The core"
    >
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          className="ls-core__particle"
          style={{
            left: `${Math.random() * 100}%`,
            top:  `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            opacity: 0.2 + Math.random() * 0.6,
          }}
        />
      ))}

      <div className="ls-core__ring ls-core__ring--r1" />
      <div className="ls-core__ring ls-core__ring--r2" />
      <div className="ls-core__ring ls-core__ring--r3">
        {Array.from({ length: 36 }).map((_, i) => (
          <div
            key={i}
            className="ls-core__tick"
            style={{
              transform: `translate(-50%, 0) rotate(${i * 10}deg) translateY(-50%) translateY(-50%)`,
            }}
          />
        ))}
      </div>

      <svg
        viewBox="0 0 200 200"
        className="ls-core__svg"
        style={{
          transform: `rotateY(${x * 16}deg) rotateX(${-y * 16}deg)`,
        }}
      >
        {orbits.map((o, k) => (
          <ellipse
            key={k}
            cx="100" cy="100"
            rx={o.rx} ry={o.rx * 0.35}
            fill="none" stroke={o.color} strokeOpacity=".35" strokeWidth=".6"
            transform={`rotate(${k * 40} 100 100)`}
          />
        ))}
        {Array.from({ length: 6 }).map((_, i) => {
          const a  = (i / 6) * Math.PI * 2 + (x + y) * 0.5;
          const rx = 100 + Math.cos(a) * 38;
          const ry = 100 + Math.sin(a) * 38;
          return (
            <line
              key={i}
              x1="100" y1="100" x2={rx} y2={ry}
              stroke="rgba(0,224,255,.2)" strokeDasharray="1 3"
            />
          );
        })}
      </svg>

      <div className="ls-core__inner" />
    </div>
  );
}
