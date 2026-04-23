import React, { useEffect, useRef } from "react";

/**
 * MagneticButton — tugs its child toward the cursor on hover.
 *
 *   <MagneticButton strength={0.25} range={120}>
 *     <Button variant="primary" size="lg">Start free</Button>
 *   </MagneticButton>
 *
 * Computes cursor offset from the wrapper's centre, spring-lerps to a
 * damped target each frame, and applies translate3d plus a small rotate.
 * Respects prefers-reduced-motion by skipping transforms entirely.
 */
export default function MagneticButton({
  children,
  strength = 0.25,
  range = 120,
  className = "",
  ...rest
}) {
  const wrapRef = useRef(null);
  const rafRef = useRef(0);
  const activeRef = useRef(false);
  const targetRef = useRef({ x: 0, y: 0, r: 0 });
  const currRef = useRef({ x: 0, y: 0, r: 0 });
  const reducedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const el = wrapRef.current;
    if (!el) return;
    if (reducedRef.current) return;

    const tick = () => {
      const cur = currRef.current;
      const tgt = targetRef.current;
      const ease = 0.2;
      cur.x += (tgt.x - cur.x) * ease;
      cur.y += (tgt.y - cur.y) * ease;
      cur.r += (tgt.r - cur.r) * ease;

      if (el) {
        el.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0) rotate(${cur.r.toFixed(3)}deg)`;
      }

      const stillMoving =
        Math.abs(cur.x - tgt.x) > 0.05 ||
        Math.abs(cur.y - tgt.y) > 0.05 ||
        Math.abs(cur.r - tgt.r) > 0.01;

      if (activeRef.current || stillMoving) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
      }
    };

    const ensureLoop = () => {
      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    const onEnter = () => {
      activeRef.current = true;
      ensureLoop();
    };

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < range) {
        targetRef.current.x = dx * strength;
        targetRef.current.y = dy * strength;
        // Clamp translate to the 12px budget named in spec.
        const max = 12;
        if (Math.abs(targetRef.current.x) > max) {
          targetRef.current.x = Math.sign(targetRef.current.x) * max;
        }
        if (Math.abs(targetRef.current.y) > max) {
          targetRef.current.y = Math.sign(targetRef.current.y) * max;
        }
        // Small rotation proportional to vertical pull, clamped to +/-3deg.
        let rot = dy * 0.05;
        if (rot > 3) rot = 3;
        if (rot < -3) rot = -3;
        targetRef.current.r = rot;
      } else {
        targetRef.current.x = 0;
        targetRef.current.y = 0;
        targetRef.current.r = 0;
      }
      ensureLoop();
    };

    const onLeave = () => {
      activeRef.current = false;
      targetRef.current.x = 0;
      targetRef.current.y = 0;
      targetRef.current.r = 0;
      ensureLoop();
    };

    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (el) el.style.transform = "";
    };
  }, [strength, range]);

  return (
    <span
      ref={wrapRef}
      data-cursor="interactive"
      className={`magnetic-wrap ${className}`.trim()}
      {...rest}
    >
      {children}
    </span>
  );
}
