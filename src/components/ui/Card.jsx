import React from "react";

/**
 * Card — neutral product-panel surface. Use `interactive` for clickable cards,
 * `selected` for a chosen card in a picker. Adds the shared shadow/border
 * look so we don't repeat Tailwind class strings in every page.
 */
export default function Card({
  interactive,
  selected,
  as: Comp = "div",
  className = "",
  children,
  ...rest
}) {
  const cls =
    `ui-card ${interactive ? "ui-card--interactive" : ""} ${selected ? "ui-card--selected" : ""} ${className}`
      .replace(/\s+/g, " ")
      .trim();
  return (
    <Comp className={cls} {...rest}>
      {children}
    </Comp>
  );
}
