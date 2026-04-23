import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * TypewriterRotator — cycles through phrases with a typewriter effect.
 *
 *   <TypewriterRotator
 *     phrases={["films your concert.", "clips your archive."]}
 *     typeSpeed={45}
 *     deleteSpeed={25}
 *     holdDuration={1600}
 *   />
 *
 * States: typing -> holding -> deleting -> next phrase. Renders a blinking
 * underscore cursor after the live text. Reserves min-width of the longest
 * phrase so layout does not reflow. Respects prefers-reduced-motion by
 * showing the first phrase statically.
 */
export default function TypewriterRotator({
  phrases = [],
  typeSpeed = 45,
  deleteSpeed = 25,
  holdDuration = 1600,
  className = "",
  cursorChar = "_",
}) {
  const safePhrases = useMemo(
    () => (phrases && phrases.length ? phrases : [""]),
    [phrases]
  );
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState("typing");
  const [reduced, setReduced] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  useEffect(() => {
    if (reduced) {
      setText(safePhrases[0] || "");
      return;
    }

    const current = safePhrases[index] || "";

    const clear = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (phase === "typing") {
      if (text.length < current.length) {
        timerRef.current = window.setTimeout(() => {
          setText(current.slice(0, text.length + 1));
        }, typeSpeed);
      } else {
        timerRef.current = window.setTimeout(() => {
          setPhase("deleting");
        }, holdDuration);
      }
    } else if (phase === "deleting") {
      if (text.length > 0) {
        timerRef.current = window.setTimeout(() => {
          setText(current.slice(0, text.length - 1));
        }, deleteSpeed);
      } else {
        setIndex((i) => (i + 1) % safePhrases.length);
        setPhase("typing");
      }
    }

    return clear;
  }, [
    reduced,
    phase,
    text,
    index,
    safePhrases,
    typeSpeed,
    deleteSpeed,
    holdDuration,
  ]);

  // Reset cleanly if the phrase list changes.
  useEffect(() => {
    setIndex(0);
    setText("");
    setPhase("typing");
  }, [safePhrases]);

  const longest = useMemo(() => {
    let best = "";
    for (const p of safePhrases) if (p.length > best.length) best = p;
    return best;
  }, [safePhrases]);

  if (reduced) {
    return (
      <span className={className} aria-live="polite">
        {safePhrases[0] || ""}
      </span>
    );
  }

  return (
    <span
      className={`typewriter-reserve ${className}`.trim()}
      aria-live="polite"
    >
      <span className="typewriter-ghost" aria-hidden="true">
        {longest}
        {cursorChar}
      </span>
      <span className="typewriter-live">
        <span>{text}</span>
        <span className="typewriter-cursor" aria-hidden="true">
          {cursorChar}
        </span>
      </span>
    </span>
  );
}
