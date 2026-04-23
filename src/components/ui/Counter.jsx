import React, { useEffect, useRef, useState } from "react";

/**
 * Counter — animates a numeric value from 0 to `target` on first scroll
 * into view, using requestAnimationFrame and an ease-out-cubic curve.
 *
 *   <Counter target={10} suffix="+" duration={1400} />
 *   <Counter target="<1s" />   // non-numeric → fades in, no count
 *
 * Respects prefers-reduced-motion — skips the animation entirely and
 * shows the final value immediately.
 */
export default function Counter({
  target,
  prefix = "",
  suffix = "",
  duration = 1400,
  precision = 0,
  className = "",
}) {
  const ref = useRef(null);
  const rafRef = useRef(0);
  const startedRef = useRef(false);
  const [display, setDisplay] = useState(null);
  const [reduced, setReduced] = useState(false);

  const numericTarget =
    typeof target === "number" ? target : parseTargetNumber(target);
  const isNumeric = numericTarget !== null;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);

  useEffect(() => {
    // If reduced-motion or non-numeric target → render final directly.
    if (reduced || !isNumeric) {
      setDisplay(isNumeric ? numericTarget : target);
      return;
    }

    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setDisplay(numericTarget);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            obs.disconnect();
            runAnimation();
          }
        });
      },
      { threshold: 0.3, rootMargin: "0px 0px -20px 0px" }
    );
    obs.observe(node);

    function runAnimation() {
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = eased * numericTarget;
        setDisplay(value);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(numericTarget);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      obs.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, isNumeric, numericTarget, duration]);

  let rendered;
  if (!isNumeric) {
    rendered = target;
  } else if (display === null) {
    rendered = formatNumber(0, precision);
  } else {
    rendered = formatNumber(display, precision);
  }

  return (
    <span
      ref={ref}
      className={`${className} ${!isNumeric && !reduced ? "counter-fade" : ""}`.trim()}
    >
      {prefix}
      {rendered}
      {suffix}
    </span>
  );
}

function parseTargetNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  // Pure number string — let Counter animate it.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  return null;
}

function formatNumber(v, precision) {
  if (precision > 0) return v.toFixed(precision);
  return Math.round(v).toString();
}
