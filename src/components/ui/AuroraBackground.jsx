import React, { useRef } from "react";

/**
 * AuroraBackground — a premium, versatile animated backdrop for the job
 * wizard (and any full-page flow). Brand-colored aurora blobs that WANDER
 * organically (multi-waypoint drift + scale + slow rotation), each with a
 * randomized path/speed/phase per load so the motion never looks canned,
 * blended additively (screen) over a filmic grain + vignette.
 *
 * GPU-only (transform/opacity), fixed & pointer-events-none, and fully
 * static when the user prefers reduced motion.
 */
export default function AuroraBackground({ className = "", intensity = 1 }) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Randomize each blob's path / speed / phase ONCE per mount so every
  // visit feels different and the blobs never move in lock-step.
  const paramsRef = useRef(null);
  if (!paramsRef.current) {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const BASE = [
      { c: "rgba(224,49,43,0.58)", top: "-14%", left: "-10%", size: 660 },
      { c: "rgba(255,75,69,0.50)", top: "34%", left: "60%", size: 600 },
      { c: "rgba(245,158,11,0.42)", top: "66%", left: "4%", size: 560 },
      { c: "rgba(139,92,246,0.32)", top: "-2%", left: "68%", size: 520 },
      { c: "rgba(236,72,153,0.26)", top: "76%", left: "68%", size: 480 },
    ];
    paramsRef.current = BASE.map((b, i) => ({
      ...b,
      kf: `kx-w${1 + Math.floor(Math.random() * 4)}`,
      dur: rnd(22, 46),
      delay: -rnd(0, 40),
      reverse: Math.random() > 0.5,
    }));
  }
  const blobs = paramsRef.current;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 overflow-hidden pointer-events-none ${className}`}
      style={{ background: "radial-gradient(140% 120% at 50% -10%, #12101c 0%, #0b0a12 55%, #08070d 100%)" }}
    >
      <style>{`
        @keyframes kx-w1 {
          0%   { transform: translate(0%,0%)     scale(1)    rotate(0deg); }
          20%  { transform: translate(11%,7%)    scale(1.15) rotate(6deg); }
          40%  { transform: translate(4%,-9%)    scale(0.94) rotate(-4deg); }
          60%  { transform: translate(-10%,5%)   scale(1.1)  rotate(3deg); }
          80%  { transform: translate(-6%,-7%)   scale(1.03) rotate(-3deg); }
          100% { transform: translate(0%,0%)     scale(1)    rotate(0deg); }
        }
        @keyframes kx-w2 {
          0%   { transform: translate(0%,0%)     scale(1.05) rotate(0deg); }
          25%  { transform: translate(-12%,6%)   scale(0.9)  rotate(-5deg); }
          50%  { transform: translate(8%,10%)    scale(1.18) rotate(4deg); }
          75%  { transform: translate(10%,-8%)   scale(0.96) rotate(6deg); }
          100% { transform: translate(0%,0%)     scale(1.05) rotate(0deg); }
        }
        @keyframes kx-w3 {
          0%   { transform: translate(0%,0%)     scale(0.98) rotate(0deg); }
          18%  { transform: translate(9%,-6%)    scale(1.12) rotate(5deg); }
          38%  { transform: translate(-7%,-10%)  scale(0.92) rotate(-6deg); }
          58%  { transform: translate(-11%,8%)   scale(1.14) rotate(2deg); }
          78%  { transform: translate(6%,9%)     scale(1.0)  rotate(-2deg); }
          100% { transform: translate(0%,0%)     scale(0.98) rotate(0deg); }
        }
        @keyframes kx-w4 {
          0%   { transform: translate(0%,0%)     scale(1.02) rotate(0deg); }
          22%  { transform: translate(-9%,-7%)   scale(1.16) rotate(-4deg); }
          44%  { transform: translate(11%,4%)    scale(0.93) rotate(5deg); }
          66%  { transform: translate(5%,11%)    scale(1.08) rotate(-3deg); }
          88%  { transform: translate(-8%,6%)    scale(1.0)  rotate(3deg); }
          100% { transform: translate(0%,0%)     scale(1.02) rotate(0deg); }
        }
        @keyframes kx-drift { 0%{transform:translate(0,0)} 50%{transform:translate(-3%,3%)} 100%{transform:translate(0,0)} }
      `}</style>

      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: b.top,
            left: b.left,
            width: b.size * intensity,
            height: b.size * intensity,
            borderRadius: "9999px",
            background: `radial-gradient(circle at 50% 50%, ${b.c} 0%, transparent 68%)`,
            filter: "blur(64px)",
            mixBlendMode: "screen",
            willChange: "transform",
            animation: reduce
              ? "none"
              : `${b.kf} ${b.dur.toFixed(1)}s cubic-bezier(0.45,0.05,0.55,0.95) ${b.delay.toFixed(1)}s infinite ${b.reverse ? "alternate-reverse" : "alternate"}`,
          }}
        />
      ))}

      {/* Fine grain veil for filmic texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          animation: reduce ? "none" : "kx-drift 40s ease-in-out infinite",
        }}
      />

      {/* Soft vignette to focus the center content */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}
