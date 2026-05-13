import type { Config } from "tailwindcss";

/**
 * Tailwind is the utility layer; the design tokens live in globals.css and
 * are bridged here as rgb-triplet vars so utilities like `bg-surface/60`
 * keep working. The new Lattice palette is dark-only — no light variants.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  // Dark-only product. We pin the class but `color-scheme:dark` is forced
  // on :root so this is effectively a no-op.
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "SF Mono", "Menlo", "monospace"],
        display: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        elevated: "rgb(var(--bg-elevated) / <alpha-value>)",
        sunken: "rgb(var(--bg-sunken) / <alpha-value>)",
        "neutral-0": "rgb(var(--neutral-0) / <alpha-value>)",
        "neutral-50": "rgb(var(--neutral-50) / <alpha-value>)",
        "neutral-100": "rgb(var(--neutral-100) / <alpha-value>)",
        "neutral-200": "rgb(var(--neutral-200) / <alpha-value>)",
        "neutral-300": "rgb(var(--neutral-300) / <alpha-value>)",
        "neutral-400": "rgb(var(--neutral-400) / <alpha-value>)",
        "neutral-500": "rgb(var(--neutral-500) / <alpha-value>)",
        "neutral-700": "rgb(var(--neutral-700) / <alpha-value>)",
        "neutral-900": "rgb(var(--neutral-900) / <alpha-value>)",
        "fg-faint": "rgb(var(--fg-faint) / <alpha-value>)",
        "fg-muted": "rgb(var(--fg-muted) / <alpha-value>)",
        "fg-default": "rgb(var(--fg-default) / <alpha-value>)",
        "fg-strong": "rgb(var(--fg-strong) / <alpha-value>)",
        "border-subtle": "rgb(var(--border-default-rgb) / 0.05)",
        "border-default": "rgb(var(--border-default-rgb) / 0.08)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        "danger-soft": "rgb(var(--danger-soft) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        "success-soft": "rgb(var(--success-soft) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        "warning-soft": "rgb(var(--warning-soft) / <alpha-value>)",
      },
      borderRadius: {
        none: "0",
        sm: "6px",
        DEFAULT: "6px",
        md: "10px",
        lg: "14px",
        xl: "14px",
        "2xl": "14px",
        full: "9999px",
      },
      // Box-shadow is reserved for accent-glow on live state. No drop shadows,
      // no hairline rings — surfaces step instead.
      boxShadow: {
        none: "none",
        glow: "0 0 16px var(--accent-glow)",
        "glow-sm": "0 0 8px var(--accent-glow)",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
        out: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        DEFAULT: "160ms",
        fast: "120ms",
        base: "160ms",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms cubic-bezier(0.4, 0, 0.2, 1)",
        "scale-in": "fade-in 120ms cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-up": "fade-in 120ms cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
