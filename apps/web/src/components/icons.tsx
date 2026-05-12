/**
 * Inline SVG icon set.
 *
 * Keep stroke-only icons at 1.6px, 24x24 viewport. Color via currentColor so
 * Tailwind text-* classes drive them. Avoid any external icon library — these
 * are stable, tiny, and design-system-consistent.
 */

type IconProps = { className?: string; "aria-hidden"?: boolean } & React.SVGProps<SVGSVGElement>;

// Icons are decorative by default — they always accompany text labels.
// Setting `aria-hidden` and `role="img"` keeps Biome's a11y rule happy and
// is the correct semantic for decorative glyphs.
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  role: "img" as const,
  focusable: false,
};

export function FolderIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.379a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 12.121 8H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
    </svg>
  );
}
export function FolderPlusIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.379a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 12.121 8H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
      <path d="M12 12v4M10 14h4" />
    </svg>
  );
}
export function CloudIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M7 18a4 4 0 0 1-.6-7.957A6 6 0 0 1 18 10a4 4 0 0 1-1 7.874" />
      <path d="M7 18h11" />
    </svg>
  );
}
export function SearchIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.35-4.35" />
    </svg>
  );
}
export function ChatIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M21 12c0 4.418-4.03 8-9 8-1.247 0-2.434-.222-3.514-.623L4 21l1.108-3.696C4.41 16.123 4 14.604 4 13c0-4.418 4.03-8 9-8s8 3.582 8 7Z" />
    </svg>
  );
}
export function PlusIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function SparkleIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
      <path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" />
    </svg>
  );
}
export function CommandIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />
    </svg>
  );
}
export function SettingsIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 0 1 4.27 16.96l.06-.06A1.65 1.65 0 0 0 4.66 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 7.04 4.27l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
export function MenuIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
export function XIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
export function CheckIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
export function ArrowRightIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
export function FileIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
export function InboxIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}
export function LayersIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="m12 2 9 4.5L12 11 3 6.5 12 2Z" />
      <path d="m3 12 9 4.5L21 12" />
      <path d="m3 17.5 9 4.5 9-4.5" />
    </svg>
  );
}
export function LinkIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

/** Brand mark — mirrors the bundled app icon (icon.png). Bold L letterform on
 *  a near-black rounded tile. Stays identical across light/dark themes so the
 *  in-app logo and the OS icon are visually the same object.
 */
export function LatticeMark({
  className = "",
  withWordmark = true,
  size = 22,
}: {
  className?: string;
  withWordmark?: boolean;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="shrink-0"
        aria-hidden
        role="img"
        focusable="false"
      >
        <title>Lattice</title>
        <rect x="0" y="0" width="24" height="24" rx="5.5" fill="#0e0d0b" />
        {/* L letterform — proportions calibrated to icon.png */}
        <path d="M7.6 5.2h2.4v11.2H17v2.4H7.6V5.2Z" fill="#e8e6e1" />
      </svg>
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg-default">
          Lattice
        </span>
      )}
    </span>
  );
}
