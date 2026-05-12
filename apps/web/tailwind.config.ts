import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
        display: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        elevated: "rgb(var(--bg-elevated) / <alpha-value>)",
        sunken: "rgb(var(--bg-sunken) / <alpha-value>)",
        // Neutral ramp — exposed so utilities like `bg-neutral-100` work
        // alongside the role-based colors below.
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
        "border-subtle": "rgb(var(--border-subtle) / <alpha-value>)",
        "border-default": "rgb(var(--border-default) / <alpha-value>)",
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
      // Spacing extensions — exposes the rhythm scale (4 / 8 / 24 / 48) as
      // named utilities so callsites can say `gap-rhythm-tight` instead of
      // remembering the px.
      spacing: {
        "rhythm-x": "4px", // label ↔ input, icon ↔ text within a control
        "rhythm-tight": "8px", // within a field group
        "rhythm-base": "16px", // default
        "rhythm-group": "24px", // between field groups
        "rhythm-section": "48px", // between page sections
      },
      borderRadius: {
        // Goal: 6px default for inputs/buttons, 8px for cards. Two radii max.
        none: "0",
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "8px",
        "2xl": "8px",
        full: "9999px",
      },
      boxShadow: {
        // Single elevation system: hairline only. No drop shadows.
        none: "none",
        card: "0 0 0 1px rgb(0 0 0 / 0.06)",
        popover: "0 0 0 1px rgb(0 0 0 / 0.06)",
        ring: "0 0 0 1px rgb(var(--accent))",
      },
      transitionTimingFunction: {
        // One curve, used everywhere.
        DEFAULT: "cubic-bezier(0.16, 1, 0.3, 1)",
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        // Two durations — fast (hover/focus) and base (open/close).
        DEFAULT: "120ms",
        fast: "120ms",
        base: "200ms",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        // Opacity only. Aliases keep existing call-sites working without
        // re-introducing slide/scale.
        "fade-in": "fade-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "fade-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "fade-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
