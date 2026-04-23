import React, { useCallback, useRef, useState } from "react";
import Button from "./Button";

/**
 * GlowButton — wraps Button with a cursor-tracking radial highlight.
 *
 *   <GlowButton as={Link} to="/register" size="lg">Start free</GlowButton>
 *
 * Sets --glow-x / --glow-y CSS custom properties on the element so the
 * `.ui-btn-glow` class (defined in index.css) can position a radial
 * gradient under the cursor. Gracefully no-ops under prefers-reduced-motion
 * because the CSS guard drops the gradient.
 */
export default function GlowButton({
  variant = "primary",
  className = "",
  onMouseMove,
  onMouseLeave,
  style,
  children,
  ...rest
}) {
  const ref = useRef(null);
  const [glow, setGlow] = useState({ x: 50, y: 50, visible: false });

  const handleMove = useCallback(
    (e) => {
      const el = ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setGlow({ x, y, visible: true });
      }
      if (onMouseMove) onMouseMove(e);
    },
    [onMouseMove]
  );

  const handleLeave = useCallback(
    (e) => {
      setGlow((g) => ({ ...g, visible: false }));
      if (onMouseLeave) onMouseLeave(e);
    },
    [onMouseLeave]
  );

  const mergedStyle = {
    ...style,
    "--glow-x": `${glow.x}%`,
    "--glow-y": `${glow.y}%`,
    "--glow-opacity": glow.visible ? 1 : 0,
  };

  return (
    <Button
      {...rest}
      ref={ref}
      variant={variant}
      className={`ui-btn-glow ${className}`.trim()}
      style={mergedStyle}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {children}
    </Button>
  );
}
