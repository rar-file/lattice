"use client";

import Link from "next/link";
import { ChevronRightIcon, LatticeMark } from "./icons";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Settings-page header. Lattice mark → breadcrumb trail (sans for labels,
 * mono for path-shaped tails). No border under the bar — surfaces step
 * instead, courtesy of the canvas surface-base sitting under surface-raised
 * content below.
 */
export function Breadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav
      className="flex h-12 items-center gap-2 px-6"
      style={{ background: "var(--surface-base)" }}
    >
      <Link
        href="/"
        className="inline-flex items-center h-8 focus-ring rounded -mx-1 px-1"
        aria-label="Lattice home"
      >
        <LatticeMark withWordmark={false} size={18} />
      </Link>
      <ChevronRightIcon className="h-3 w-3 shrink-0" style={{ color: "var(--text-tertiary)" }} />
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={c.label} className="inline-flex items-center gap-2 min-w-0">
            {c.href && !last ? (
              <Link
                href={c.href}
                className="text-[13px] focus-ring rounded -mx-1 px-1 truncate leading-none transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                {c.label}
              </Link>
            ) : (
              <span
                className="text-[13px] truncate leading-none"
                style={{
                  color: last ? "var(--text-emphasis)" : "var(--text-secondary)",
                  fontWeight: last ? 500 : 400,
                }}
              >
                {c.label}
              </span>
            )}
            {!last && (
              <ChevronRightIcon
                className="h-3 w-3 shrink-0"
                style={{ color: "var(--text-tertiary)" }}
              />
            )}
          </span>
        );
      })}
    </nav>
  );
}
