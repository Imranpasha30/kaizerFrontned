import React, { forwardRef, useEffect, useRef } from "react";

/**
 * Tilt3D — cursor-driven 3D tilt wrapper.
 *
 *   <Tilt3D max={6} glare>
 *     <LayoutPreview layout="split2_hstack" size="full" />
 *   </Tilt3D>
 *
 * Tracks cursor position inside its bounds, rotates the inner layer, and
 * optionally paints a radial highlight that follows the cursor. Uses a
 * fast transition during active move and a 200ms ease-out on reset.
 * Respects prefers-reduced-motion by rendering children flat.
 */
const Tilt3D = forwardRef(function Tilt3D(
  {
    children,
    max = 8,
    glare = false,
    scale = 1,
    className = "",
    innerClassName = "",
    ...rest
  },
  ref
) {
  const rootRef = useRef(null);
  const innerRef = useRef(null);
  const glareRef = useRef(null);
  const reducedRef = useRef(false);

  // Expose the root to callers who pass a ref.
  useEffect(() => {
    if (!ref) return;
    if (typeof ref === "function") {
      ref(rootRef.current);
    } else {
      ref.current = rootRef.current;
    }
  }, [ref]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedRef.current) return;

    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;

    const onMove = (e) => {
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      const rx = (-py * max).toFixed(3);
      const ry = (px * max).toFixed(3);
      // Track smoothly during active move.
      inner.style.transition = "transform 0ms linear";
      inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale}) translateZ(0)`;
      if (glare && glareRef.current) {
        const gx = ((e.clientX - rect.left) / rect.width) * 100;
        const gy = ((e.clientY - rect.top) / rect.height) * 100;
        glareRef.current.style.setProperty("--glare-x", `${gx}%`);
        glareRef.current.style.setProperty("--glare-y", `${gy}%`);
      }
    };

    const onEnter = () => {
      root.classList.add("is-hovering");
    };

    const onLeave = () => {
      root.classList.remove("is-hovering");
      inner.style.transition = "transform 200ms ease-out";
      inner.style.transform = `rotateX(0deg) rotateY(0deg) scale(1) translateZ(0)`;
    };

    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseenter", onEnter);
    root.addEventListener("mouseleave", onLeave);

    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseenter", onEnter);
      root.removeEventListener("mouseleave", onLeave);
    };
  }, [max, scale, glare]);

  return (
    <div
      ref={rootRef}
      className={`tilt-root relative ${className}`.trim()}
      {...rest}
    >
      <div
        ref={innerRef}
        className={`tilt-inner ${innerClassName}`.trim()}
        style={{ transform: "rotateX(0deg) rotateY(0deg) translateZ(0)" }}
      >
        {children}
      </div>
      {glare ? <div ref={glareRef} className="tilt-glare" aria-hidden="true" /> : null}
    </div>
  );
});

export default Tilt3D;
