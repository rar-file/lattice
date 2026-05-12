"use client";

import Link from "next/link";
import { ChevronRightIcon, LatticeMark } from "./icons";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Settings-page header chrome — full-width bar with the brand mark, then a
 * chevron-separated breadcrumb trail. Everything sits on the same baseline,
 * so it reads as one tidy row instead of icons fighting text.
 */
export function Breadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex h-12 max-w-4xl items-center gap-2 px-6">
        <Link
          href="/"
          className="inline-flex items-center h-8 focus-ring rounded -mx-1 px-1"
          aria-label="Lattice home"
        >
          <LatticeMark withWordmark={false} size={20} />
        </Link>
        <ChevronRightIcon className="h-3 w-3 text-fg-faint shrink-0" />
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <span key={c.label} className="inline-flex items-center gap-2 min-w-0">
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="text-[13px] text-fg-muted hover:text-fg-default focus-ring rounded -mx-1 px-1 truncate leading-none"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  className={`text-[13px] truncate leading-none ${
                    last ? "text-fg-default font-medium" : "text-fg-muted"
                  }`}
                >
                  {c.label}
                </span>
              )}
              {!last && <ChevronRightIcon className="h-3 w-3 text-fg-faint shrink-0" />}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
