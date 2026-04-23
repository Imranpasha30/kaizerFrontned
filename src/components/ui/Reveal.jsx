import React, { useEffect, useRef, useState } from "react";

/**
 * Reveal — fades + rises its children when they scroll into view.
 *
 *   <Reveal delay={120}>
 *     <h2 className="heading-hero">Your headline</h2>
 *   </Reveal>
 *
 * Uses a single IntersectionObserver per instance (no library). Respects
 * prefers-reduced-motion — reduced-motion users get the final state with
 * no transition.
 */
export default function Reveal({
  children,
  delay = 0,
  once = true,
  as: Comp = "div",
  className = "",
  style,
  ...rest
}) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);

  useEffect(() => {
    if (reduced) {
      setRevealed(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setRevealed(false);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [once, reduced]);

  const transitionClass = reduced
    ? ""
    : revealed
      ? "opacity-100 translate-y-0 transition-all duration-700 ease-out"
      : "opacity-0 translate-y-4 transition-all duration-700 ease-out";

  const mergedStyle = reduced
    ? style
    : { transitionDelay: `${delay}ms`, ...style };

  return (
    <Comp
      ref={ref}
      className={`${transitionClass} ${className}`.trim()}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </Comp>
  );
}
