"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "lattice.theme";

interface ThemeContext {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme(t: Theme): void;
}

const Ctx = createContext<ThemeContext | null>(null);

export function useTheme(): ThemeContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/**
 * Theme provider. Three states (system / light / dark), persisted to
 * localStorage. When set to system, follows prefers-color-scheme.
 *
 * The CSS in globals.css drives off `.theme-light` / `.theme-dark` classes
 * on <html>; when neither is present, the `@media (prefers-color-scheme:
 * dark)` block in globals.css kicks in.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Initial mount: read stored preference and the current media query.
  useEffect(() => {
    let initial: Theme = "system";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") initial = raw;
    } catch {}
    setThemeState(initial);
  }, []);

  // Apply the theme to the document + compute resolved (the actual mode used).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark");
    if (theme === "light") {
      root.classList.add("theme-light");
      setResolved("light");
    } else if (theme === "dark") {
      root.classList.add("theme-dark");
      setResolved("dark");
    } else {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      setResolved(media.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) => setResolved(e.matches ? "dark" : "light");
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  }

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}
