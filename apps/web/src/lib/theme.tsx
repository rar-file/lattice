"use client";

import { createContext, useContext } from "react";

/**
 * Lattice is dark-only: the goal pins `color-scheme:dark` and the design
 * language is built around the violet-on-near-black palette. The light theme
 * has been removed; this surface is kept so existing call-sites compile, but
 * everything resolves to "dark".
 */
export type Theme = "dark";

interface ThemeContext {
  theme: Theme;
  resolved: "dark";
  setTheme(t: Theme): void;
}

const Ctx = createContext<ThemeContext>({
  theme: "dark",
  resolved: "dark",
  setTheme: () => {},
});

export function useTheme(): ThemeContext {
  return useContext(Ctx);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <Ctx.Provider value={{ theme: "dark", resolved: "dark", setTheme: () => {} }}>
      {children}
    </Ctx.Provider>
  );
}
