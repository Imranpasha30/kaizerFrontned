import React, { useEffect, useState } from "react";

/**
 * ReaderTools — bottom-left floating dock that lets the reader
 *   - toggle a highlighter (drag-select to mark passages in yellow)
 *   - clear any marks they've laid down
 *   - jump to the top of the page
 *
 * Newspaper-only — adds editorial flavor without affecting modern mode.
 */
export default function ReaderTools() {
  const [hl, setHl] = useState(false);

  useEffect(() => {
    if (hl) document.body.classList.add("ls-hl-on");
    else    document.body.classList.remove("ls-hl-on");
  }, [hl]);

  useEffect(() => {
    if (!hl) return;
    function onUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      try {
        const span = document.createElement("span");
        span.className = "ls-hl-mark";
        range.surroundContents(span);
        sel.removeAllRanges();
      } catch { /* invalid selection across mixed nodes — silently ignore */ }
    }
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [hl]);

  function clearMarks() {
    document.querySelectorAll(".ls-hl-mark").forEach((n) => {
      const p = n.parentNode;
      while (n.firstChild) p.insertBefore(n.firstChild, n);
      p.removeChild(n);
      p.normalize();
    });
  }

  function top() { window.scrollTo({ top: 0, behavior: "smooth" }); }

  return (
    <div className="ls-tools" aria-hidden>
      <button
        type="button"
        className={`ls-tools__btn ${hl ? "is-active" : ""}`}
        onClick={() => setHl(!hl)}
        title="Highlighter"
      >
        ✎
        <span className="ls-tools__tip">Highlighter</span>
      </button>
      <button type="button" className="ls-tools__btn" onClick={clearMarks} title="Clear marks">
        ⌫
        <span className="ls-tools__tip">Clear marks</span>
      </button>
      <button type="button" className="ls-tools__btn" onClick={top} title="To top">
        ↑
        <span className="ls-tools__tip">To top</span>
      </button>
    </div>
  );
}
