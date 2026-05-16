import React, { useEffect, useRef } from "react";

/**
 * LivingCursor — morphing cyan blob + dot + label for the modern view.
 *
 * - .is-hover : grows over interactive targets
 * - .is-press : shrinks while mouse is down
 * - .is-text  : collapses into a thin caret over copy
 * - .is-huge  : enlarges over `.ls-huge-target` regions (engine core)
 *
 * Skipped on coarse-pointer (touch) devices.
 */
export default function LivingCursor() {
  const blobRef  = useRef(null);
  const dotRef   = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(pointer:coarse)").matches) return;
    document.documentElement.classList.add("ls-cursor-modern");

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let bx = mx, by = my, dx = mx, dy = my;
    let raf;

    function onMove(e) { mx = e.clientX; my = e.clientY; }
    function onDown()  { blobRef.current?.classList.add("is-press"); }
    function onUp()    { blobRef.current?.classList.remove("is-press"); }
    function onOver(e) {
      const t = e.target.closest('a, button, [role="button"], [data-cursor], input, textarea, .ls-huge-target, .ls-pricing__tier, .ls-trust__scope, .ls-faq__row, .ls-pipeline__stage');
      const blob = blobRef.current, dot = dotRef.current, lbl = labelRef.current;
      if (!blob || !dot || !lbl) return;
      blob.classList.remove("is-hover", "is-text", "is-huge");
      lbl.classList.remove("is-show");
      dot.style.opacity = "1";
      if (!t) return;
      if (t.matches("input, textarea")) { blob.classList.add("is-text"); return; }
      if (t.matches(".ls-huge-target")) {
        blob.classList.add("is-huge"); dot.style.opacity = "0"; return;
      }
      blob.classList.add("is-hover");
      const c = t.getAttribute("data-cursor");
      if (c) { lbl.textContent = c; lbl.classList.add("is-show"); }
      else if (t.tagName === "A" || t.tagName === "BUTTON") {
        lbl.textContent = "Press"; lbl.classList.add("is-show");
      }
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup",   onUp);
    document.addEventListener("mouseover", onOver, { passive: true });

    function tick() {
      bx += (mx - bx) * 0.18; by += (my - by) * 0.18;
      dx += (mx - dx) * 0.55; dy += (my - dy) * 0.55;
      const blob = blobRef.current, dot = dotRef.current, lbl = labelRef.current;
      if (blob) {
        const w = blob.offsetWidth, h = blob.offsetHeight;
        blob.style.transform = `translate3d(${bx - w / 2}px, ${by - h / 2}px, 0)`;
      }
      if (dot) dot.style.transform = `translate3d(${dx - 3}px, ${dy - 3}px, 0)`;
      if (lbl) lbl.style.transform = `translate3d(${dx + 18}px, ${dy + 18}px, 0)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup",   onUp);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.classList.remove("ls-cursor-modern");
    };
  }, []);

  return (
    <>
      <div ref={blobRef}  className="ls-blob" aria-hidden></div>
      <div ref={dotRef}   className="ls-blob-dot" aria-hidden></div>
      <div ref={labelRef} className="ls-blob-label" aria-hidden></div>
    </>
  );
}
