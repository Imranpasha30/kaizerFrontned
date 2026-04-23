import React, { forwardRef } from "react";

/**
 * Button — the standard product button. Two looks + two sizes.
 *
 *   <Button>Primary</Button>
 *   <Button variant="ghost">Ghost</Button>
 *   <Button size="lg" leftIcon={<Play />}>Watch demo</Button>
 *
 * When `as` is passed (e.g. "a", or a router Link), the element type is swapped
 * but the visual classes remain — makes link-styled buttons painless.
 */
const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    leftIcon,
    rightIcon,
    className = "",
    disabled,
    loading,
    children,
    as: Comp = "button",
    ...rest
  },
  ref,
) {
  const base =
    variant === "primary" ? "ui-btn-primary" :
    variant === "ghost"   ? "ui-btn-ghost"   :
    /* subtle */            "ui-btn-ghost";

  const sizeClass =
    size === "lg" ? "text-[15px] px-6 py-[13px]" :
    size === "sm" ? "text-[13px] px-3 py-[7px]"  :
    "";

  const state = loading ? "animate-pulse-soft" : "";

  return (
    <Comp
      {...rest}
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${sizeClass} ${state} ${className}`.trim()}
    >
      {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
      <span>{children}</span>
      {rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </Comp>
  );
});

export default Button;
