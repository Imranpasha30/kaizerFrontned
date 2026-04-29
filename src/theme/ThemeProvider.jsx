import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "kaizer_theme";
// Default theme: LIGHT. Kaizer News presents itself as a SaaS product
// and the YouTube compliance reviewer (and most creators) expect a
// white-background interface. Users who want dark mode can toggle via
// the sun/moon button in the NavBar; the choice is persisted in
// localStorage and survives reloads.
const ThemeContext = createContext({ theme: "light", toggle: () => {}, setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem(STORAGE_KEY);
    // Honor the user's previous choice; default to light otherwise.
    if (stored === "dark") return "dark";
    return "light";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === "light" ? "light" : "dark");
  }, []);
  const toggle = useCallback(() => {
    setThemeState((t) => (t === "light" ? "dark" : "light"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
