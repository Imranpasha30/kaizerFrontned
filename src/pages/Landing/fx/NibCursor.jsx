import React, { useEffect, useRef } from "react";

/**
 * NibCursor — ink-nib custom cursor for the newspaper view.
 *
 * Replaces the system pointer while inside the .ls-newspaper subtree.
 * On hover over actionable targets the nib grows; over text it collapses
 * into a narrow vertical "caret". A small mono label tracks alongside.
 *
 * Skipped automatically on coarse-pointer / touch devices.
 */
export default function NibCursor() {
  const nibRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(pointer:coarse)").matches) return;
    document.documentElement.classList.add("ls-cursor-newspaper");

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;
    let raf;

    function onMove(e) { mx = e.clientX; my = e.clientY; }
    function onOver(e) {
      const t = e.target.closest('a, button, [role="button"], [data-cursor], input, textarea, .ls-pricing__tier, .ls-trust__scope, .ls-faq__row, .ls-subnav__link');
      const nib = nibRef.current, lbl = labelRef.current;
      if (!nib || !lbl) return;
      nib.classList.remove("is-hover", "is-text");
      lbl.classList.remove("is-show");
      if (!t) return;
      if (t.matches("input, textarea, p, .ls-hero__standfirst, .ls-hero__line")) {
        nib.classList.add("is-text"); return;
      }
      nib.classList.add("is-hover");
      const c = t.getAttribute("data-cursor");
      if (c) { lbl.textContent = c; lbl.classList.add("is-show"); }
      else if (t.tagName === "A" || t.tagName === "BUTTON") {
        lbl.textContent = "Read"; lbl.classList.add("is-show");
      }
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onOver, { passive: true });

    function tick() {
      cx += (mx - cx) * 0.32;
      cy += (my - cy) * 0.32;
      const nib = nibRef.current, lbl = labelRef.current;
      if (nib) {
        const w = nib.offsetWidth, h = nib.offsetHeight;
        nib.style.transform = `translate3d(${cx - w / 2}px, ${cy - h / 2}px, 0)`;
      }
      if (lbl) lbl.style.transform = `translate3d(${cx + 18}px, ${cy + 18}px, 0)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.classList.remove("ls-cursor-newspaper");
    };
  }, []);

  return (
    <>
      <div ref={nibRef} className="ls-nib" aria-hidden>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 21l5.2-1.6 11-11-3.6-3.6-11 11L3 21zm14.6-15.6l1.8-1.8a1 1 0 0 1 1.4 0l2.2 2.2a1 1 0 0 1 0 1.4l-1.8 1.8-3.6-3.6z"/>
        </svg>
      </div>
      <div ref={labelRef} className="ls-nib-label" aria-hidden></div>
    </>
  );
}
