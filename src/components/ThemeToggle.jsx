import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../theme/ThemeProvider";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggle } = useTheme();
  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className={
        "inline-flex items-center justify-center w-8 h-8 rounded-md border " +
        "border-border hover:border-border-hover " +
        "text-gray-400 hover:text-white transition " +
        className
      }
    >
      {isLight ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
