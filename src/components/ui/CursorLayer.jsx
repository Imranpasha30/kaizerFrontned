import React, { useEffect, useRef, useState } from "react";

/**
 * CursorLayer — global custom cursor + ambient spotlight.
 *
 *   <CursorLayer />
 *
 * Mount once at the app root. Renders:
 *   - A damped outer ring and a snapping inner dot (top layer).
 *   - A radial spotlight tied to var(--cursor-x) / var(--cursor-y).
 *
 * Skips render entirely on touch devices and under prefers-reduced-motion
 * (the native OS cursor remains fully functional in both cases).
 */

const INTERACTIVE_SELECTOR =
  'a, button, [role="button"], input, textarea, select, [data-cursor="interactive"]';
const TEXT_SELECTOR = '[data-cursor="text"]';

export default function CursorLayer() {
  const [enabled, setEnabled] = useState(false);
  const ringRef = useRef(null);
  const dotRef = useRef(null);
  const rafRef = useRef(0);
  const targetRef = useRef({ x: 0, y: 0 });
  const ringPosRef = useRef({ x: 0, y: 0 });
  const dotPosRef = useRef({ x: 0, y: 0 });

  // Feature detect once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const touch = window.matchMedia("(hover: none)").matches;
    if (reduced || touch) {
      setEnabled(false);
      return;
    }
    setEnabled(true);
  }, []);

  // Primary effect: install listeners and raf loop when enabled.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const ring = ringRef.current;
    const dot = dotRef.current;

    // Seed position at viewport centre so nothing flashes at (0,0).
    const initX = window.innerWidth / 2;
    const initY = window.innerHeight / 2;
    targetRef.current = { x: initX, y: initY };
    ringPosRef.current = { x: initX, y: initY };
    dotPosRef.current = { x: initX, y: initY };
    root.style.setProperty("--cursor-x", `${initX}px`);
    root.style.setProperty("--cursor-y", `${initY}px`);

    const onMove = (e) => {
      targetRef.current.x = e.clientX;
      targetRef.current.y = e.clientY;
      root.style.setProperty("--cursor-x", `${e.clientX}px`);
      root.style.setProperty("--cursor-y", `${e.clientY}px`);
    };

    const onOver = (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== "function") return;
      if (!ring) return;
      if (t.closest(TEXT_SELECTOR)) {
        ring.classList.add("is-text");
        ring.classList.remove("is-interactive");
      } else if (t.closest(INTERACTIVE_SELECTOR)) {
        ring.classList.add("is-interactive");
        ring.classList.remove("is-text");
      }
    };

    const onOut = (e) => {
      const to = e.relatedTarget;
      if (!ring) return;
      // If we're leaving for a still-interactive element, skip the reset.
      if (to && typeof to.closest === "function") {
        if (to.closest(TEXT_SELECTOR)) return;
        if (to.closest(INTERACTIVE_SELECTOR)) return;
      }
      ring.classList.remove("is-interactive");
      ring.classList.remove("is-text");
    };

    const loop = () => {
      // Damping ~120ms feel — 0.15 lerp per frame at 60fps gets close.
      const damping = 0.15;
      const rp = ringPosRef.current;
      const dp = dotPosRef.current;
      const tg = targetRef.current;

      rp.x += (tg.x - rp.x) * damping;
      rp.y += (tg.y - rp.y) * damping;
      // Dot snaps — set directly to target.
      dp.x = tg.x;
      dp.y = tg.y;

      if (ring) {
        ring.style.transform = `translate3d(${rp.x}px, ${rp.y}px, 0) translate(-50%, -50%)`;
      }
      if (dot) {
        dot.style.transform = `translate3d(${dp.x}px, ${dp.y}px, 0) translate(-50%, -50%)`;
      }
      rafRef.current = window.requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    window.addEventListener("mouseout", onOut, { passive: true });
    rafRef.current = window.requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      window.removeEventListener("mouseout", onOut);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div className="cursor-spotlight" aria-hidden="true" />
      <div className="cursor-root" aria-hidden="true">
        <div ref={ringRef} className="cursor-ring" />
        <div ref={dotRef} className="cursor-dot" />
      </div>
    </>
  );
}
