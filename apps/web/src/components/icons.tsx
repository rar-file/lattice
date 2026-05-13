/**
 * Lattice icon set — outline-only, currentColor stroke, 1.5px on a 24px grid.
 *
 * Goal.md: "A single outline icon set (Lucide or Tabler outline). 16px or
 * 20px only. Icons inherit text colour. No filled variants."
 *
 * Paths are hand-tuned from Lucide / Tabler for visual consistency. Keep all
 * additions stylistically aligned: rounded line caps + joins, no fills, no
 * accent decoration.
 */

type IconProps = { className?: string; "aria-hidden"?: boolean } & React.SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  role: "img" as const,
  focusable: false,
};

export function FolderIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7a2 2 0 0 1 2-2h3.586a2 2 0 0 1 1.414.586L12.414 7H18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

export function FolderPlusIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7a2 2 0 0 1 2-2h3.586a2 2 0 0 1 1.414.586L12.414 7H18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  );
}

export function CloudIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M7.5 18a4.5 4.5 0 0 1-.6-8.962 6 6 0 0 1 11.566 1.486A3.75 3.75 0 0 1 17.25 18Z" />
    </svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.6-4.6" />
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

export function CommandIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M15 9V6a3 3 0 1 1 3 3h-3Zm0 0v6h-6V9h6Zm-6 0H6a3 3 0 1 1 3-3v3Zm0 6v3a3 3 0 1 1-3-3h3Zm6 0h3a3 3 0 1 1-3 3v-3Z" />
    </svg>
  );
}

export function SettingsIcon(p: IconProps) {
  // Sliders — three horizontal tracks with offset knobs. Reads cleaner at
  // 16px than a gear cogwheel.
  return (
    <svg {...base} {...p}>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

export function KeyIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="7.5" cy="14.5" r="3.5" />
      <path d="m10 12 8-8M16 6l2 2M14 8l2 2" />
    </svg>
  );
}

export function MenuIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
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
      <path d="m5 12.5 4.5 4.5L20 7" />
    </svg>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function FileIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    </svg>
  );
}

export function InboxIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 12h4l2 3h4l2-3h4" />
      <path d="M6.4 5h11.2a2 2 0 0 1 1.8 1.106L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6L4.6 6.106A2 2 0 0 1 6.4 5Z" />
    </svg>
  );
}

export function LayersIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="m12 3 9 4.5L12 12 3 7.5 12 3Z" />
      <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
    </svg>
  );
}

export function LinkIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M10.5 13.5a4 4 0 0 0 5.657 0l2.829-2.829a4 4 0 0 0-5.657-5.657L11.5 6.853" />
      <path d="M13.5 10.5a4 4 0 0 0-5.657 0L5.014 13.328a4 4 0 0 0 5.657 5.657L12.5 17.147" />
    </svg>
  );
}

export function HashIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M10 3 8 21M16 3l-2 18M4 9h17M3 15h17" />
    </svg>
  );
}

export function SunIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function MonitorIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function CopyIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function PencilIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M14 4 4 14v6h6L20 10Z" />
      <path d="M13 5l6 6" />
    </svg>
  );
}

/**
 * Lattice mark — the four-square grid, verbatim from the design goal. The
 * mark is *always* drawn in the accent colour (one of the six allowed accent
 * touches per screen); the two off-diagonals fade to 35% so the symbol reads
 * as a graph of nodes and not a checkerboard.
 *
 * The optional wordmark sits to the right in Inter 500.
 */
export function LatticeMark({
  className = "",
  withWordmark = true,
  size = 20,
}: {
  className?: string;
  withWordmark?: boolean;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        className="shrink-0"
        style={{ color: "var(--accent)" }}
        aria-hidden
        role="img"
        focusable="false"
      >
        <title>Lattice</title>
        <rect x="0" y="0" width="7" height="7" rx="1.5" fill="currentColor" />
        <rect x="9" y="0" width="7" height="7" rx="1.5" fill="currentColor" opacity=".35" />
        <rect x="0" y="9" width="7" height="7" rx="1.5" fill="currentColor" opacity=".35" />
        <rect x="9" y="9" width="7" height="7" rx="1.5" fill="currentColor" />
      </svg>
      {withWordmark && (
        <span
          className="font-medium tracking-[-0.01em] leading-none"
          style={{ fontSize: Math.max(13, Math.round(size * 0.7)), color: "var(--text-emphasis)" }}
        >
          Lattice
        </span>
      )}
    </span>
  );
}
