import React, { useEffect, useRef } from "react";

/**
 * Reveal — fade + slide in when scrolled into view. Add `data-reveal-delay="120"`
 * (ms) to chain entries. CSS lives in newspaper.css / modern.css under `.ls-reveal`.
 */
export default function Reveal({ children, delay = 0, as: Tag = "div", className = "", ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { el.classList.add("is-in"); io.unobserve(el); }
      },
      { threshold: 0.18 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`ls-reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
