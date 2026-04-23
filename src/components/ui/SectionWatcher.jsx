import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * SectionWatcher — tracks which section the viewer is focused on and
 * renders an ambient AI status pill.
 *
 *   const { activeSection, activeSectionLabel } = useActiveSection([
 *     { id: "hero", label: "Hero" },
 *     { id: "product", label: "Product" },
 *   ]);
 *
 *   <AIStatusBar label={activeSectionLabel} />
 *
 * Exports AIStatusBar as default and useActiveSection as a named hook.
 */

const DISMISS_KEY = "kaizer.aiStatusBar.dismissed";

export function useActiveSection(sections) {
  const sigKey = useMemo(
    () =>
      sections
        .map((s) => `${s.id}::${s.label || ""}`)
        .join("|"),
    [sections]
  );
  const [activeSection, setActiveSection] = useState(
    sections.length ? sections[0].id : null
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;
    if (!sections || !sections.length) return;

    const nodes = [];
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) nodes.push({ el, id: s.id });
    }
    if (!nodes.length) return;

    // A map so the callback can read "currently intersecting" ids in order.
    const state = new Map();
    nodes.forEach(({ id }) => state.set(id, false));

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id;
          state.set(id, entry.isIntersecting);
        });
        // Pick the first section (in declared order) that is intersecting.
        for (const { id } of nodes) {
          if (state.get(id)) {
            setActiveSection((prev) => (prev === id ? prev : id));
            return;
          }
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
    );

    nodes.forEach(({ el }) => obs.observe(el));
    return () => obs.disconnect();
  }, [sigKey, sections]);

  const activeSectionLabel = useMemo(() => {
    const found = sections.find((s) => s.id === activeSection);
    return found ? found.label || found.id : "";
  }, [sections, activeSection]);

  return { activeSection, activeSectionLabel };
}

function AIStatusBar({ label = "" }) {
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [displayLabel, setDisplayLabel] = useState(label);
  const [switching, setSwitching] = useState(false);
  const switchTimerRef = useRef(null);

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
    try {
      const wasDismissed = window.sessionStorage.getItem(DISMISS_KEY) === "1";
      setDismissed(wasDismissed);
    } catch (err) {
      // sessionStorage disabled — fail open.
    }
    setEnabled(true);
  }, []);

  // Typewriter-ish crossfade when label changes.
  useEffect(() => {
    if (!enabled) {
      setDisplayLabel(label);
      return;
    }
    if (label === displayLabel) return;
    setSwitching(true);
    if (switchTimerRef.current) {
      window.clearTimeout(switchTimerRef.current);
    }
    switchTimerRef.current = window.setTimeout(() => {
      setDisplayLabel(label);
      setSwitching(false);
    }, 180);
    return () => {
      if (switchTimerRef.current) {
        window.clearTimeout(switchTimerRef.current);
        switchTimerRef.current = null;
      }
    };
  }, [label, displayLabel, enabled]);

  if (!enabled) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch (err) {
      // ignore storage errors
    }
  };

  const visible = Boolean(displayLabel);

  return (
    <div
      className={`ai-status-pill ${visible ? "is-visible" : ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span className="ai-status-pill__dot" aria-hidden="true" />
      <span>
        KAIZER SEES YOU ON
        <span style={{ opacity: 0.55, margin: "0 6px" }}>{"·"}</span>
      </span>
      <span
        className={`ai-status-pill__label ${switching ? "is-switching" : ""}`.trim()}
      >
        {displayLabel}
      </span>
      <button
        type="button"
        className="ai-status-pill__close"
        aria-label="Dismiss status bar"
        onClick={handleDismiss}
      >
        {"×"}
      </button>
    </div>
  );
}

export default AIStatusBar;
