import React, { useEffect, useRef } from "react";

/**
 * ReadingBar — fixed top bar that fills horizontally as the user scrolls
 * the landing. Color matches the active mode's accent via CSS variables
 * (set on the `[data-landing-mode]` attribute by the parent).
 */
export default function ReadingBar() {
  const fill = useRef(null);
  useEffect(() => {
    function onScroll() {
      const h = document.documentElement;
      const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      if (fill.current) fill.current.style.width = `${(p * 100).toFixed(2)}%`;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="ls-readbar" aria-hidden>
      <div className="ls-readbar__fill" ref={fill} />
    </div>
  );
}
