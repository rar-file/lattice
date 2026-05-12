"use client";

import type { OpenVaultResponse } from "@lattice/sdk";
import { useEffect, useState } from "react";
import { getClient } from "../lib/client";
import { isTauri, pickVaultFolder } from "../lib/tauri";
import {
  ArrowRightIcon,
  CloudIcon,
  CommandIcon,
  FolderIcon,
  FolderPlusIcon,
  LatticeMark,
  LinkIcon,
  SearchIcon,
  SparkleIcon,
} from "./icons";

type Step = "intro" | "create" | "open" | "cloud";

interface Props {
  onOpened: (resp: OpenVaultResponse) => void;
}

/**
 * First-run experience. Shown until a vault is opened. Three paths:
 *  - "Create a new vault" — wizard that calls POST /vault/init
 *  - "Open existing folder" — directly calls POST /vault/open
 *  - "Connect cloud account" — redirects to /login
 *
 * Designed to be the answer to "I have no clue how to use this". Every screen
 * has clear copy explaining what'll happen next and the keyboard shortcuts
 * to learn afterwards.
 */
export function Welcome({ onOpened }: Props) {
  const [step, setStep] = useState<Step>("intro");

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="absolute inset-0 bg-aurora pointer-events-none" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-10 md:py-16">
        <header className="flex items-center justify-between animate-fade-in">
          <LatticeMark />
          <a
            href="https://github.com/rar-file/lattice"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-fg-muted hover:text-fg-default transition-colors focus-ring rounded px-1"
          >
            View on GitHub →
          </a>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center py-12 md:py-16">
          {step === "intro" && <Intro onPick={setStep} />}
          {step === "create" && (
            <CreateVault onCancel={() => setStep("intro")} onOpened={onOpened} />
          )}
          {step === "open" && <OpenVault onCancel={() => setStep("intro")} onOpened={onOpened} />}
          {step === "cloud" && <ConnectCloud onCancel={() => setStep("intro")} />}
        </div>

        <footer className="text-center text-[11px] text-fg-faint pb-2">
          Lattice is local-first. Your notes live as plain Markdown on your disk; the cloud option
          is opt-in.
        </footer>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Intro — hero + 3 choices                                                  */
/* -------------------------------------------------------------------------- */

function Intro({ onPick }: { onPick: (s: Step) => void }) {
  return (
    <div className="w-full max-w-2xl animate-slide-up">
      <div className="text-center space-y-4">
        <h1 className="text-[40px] md:text-[52px] leading-[1.05] font-semibold tracking-[-0.02em] text-fg-default">
          A vault that thinks
          <br />
          <span className="text-accent">with you.</span>
        </h1>
        <p className="text-[16px] md:text-[17px] text-fg-muted max-w-xl mx-auto leading-relaxed">
          Lattice is a local-first knowledge vault that grows smarter as you write. Notes you own,
          search that understands meaning, and an AI that's grounded in everything you've ever
          captured.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-3">
        <ChoiceCard
          icon={<FolderPlusIcon className="h-5 w-5 text-accent" />}
          title="Create a new vault"
          desc="Start fresh — Lattice will set up a folder with a starter note to get you going."
          onClick={() => onPick("create")}
          primary
        />
        <ChoiceCard
          icon={<FolderIcon className="h-5 w-5 text-fg-default" />}
          title="Open existing folder"
          desc="Point Lattice at a folder of Markdown files (Obsidian, Foam, plain notes)."
          onClick={() => onPick("open")}
        />
        <ChoiceCard
          icon={<CloudIcon className="h-5 w-5 text-fg-default" />}
          title="Connect cloud account"
          desc="Sync across devices and give agents secure access via hosted MCP."
          onClick={() => onPick("cloud")}
        />
      </div>

      <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
        <FeatureBullet
          icon={<SearchIcon className="h-[18px] w-[18px]" />}
          title="Hybrid search"
          desc="Semantic + keyword, ranked together. Find anything by meaning, even if you forgot the exact words."
        />
        <FeatureBullet
          icon={<SparkleIcon className="h-[18px] w-[18px]" />}
          title="Capture & synthesize"
          desc="Drop a thought, get a clean atomic note in seconds. Weekly synthesis rolls up your notes."
        />
        <FeatureBullet
          icon={<LinkIcon className="h-[18px] w-[18px]" />}
          title="Ambient links"
          desc="Lattice surfaces relevant notes as you write — one click to drop a [[wikilink]]."
        />
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  desc,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative text-left p-5 rounded-xl border transition-all duration-200 ease-out
        focus-ring
        ${
          primary
            ? "bg-surface border-accent/30 hover:border-accent/60 hover:shadow-popover"
            : "bg-surface border-border-subtle hover:border-border-strong hover:shadow-card"
        }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          primary ? "bg-accent-soft" : "bg-sunken"
        }`}
      >
        {icon}
      </div>
      <div className="mt-4 text-[14px] font-semibold tracking-tight text-fg-default">{title}</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">{desc}</p>
      <ArrowRightIcon className="absolute right-4 top-5 h-4 w-4 text-fg-faint group-hover:text-accent transition-colors" />
    </button>
  );
}

function FeatureBullet({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-fg-default">
        <span className="text-accent">{icon}</span>
        <span className="text-[13px] font-semibold tracking-tight">{title}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">{desc}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Create vault                                                              */
/* -------------------------------------------------------------------------- */

function CreateVault({
  onCancel,
  onOpened,
}: {
  onCancel: () => void;
  onOpened: (resp: OpenVaultResponse) => void;
}) {
  const tauri = isTauri();
  const [folder, setFolder] = useState("");
  const [name, setName] = useState("My Vault");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In Tauri, suggest a default location. In browser, leave blank — user can
  // type a path or paste one; we can't pick folders without OS chrome.
  useEffect(() => {
    if (!tauri) return;
    // Default to ~/Documents/Lattice — created lazily on submit if missing.
    // We only set this as a placeholder; user can change via "Choose folder".
    setFolder("");
  }, [tauri]);

  async function pickFolder() {
    const p = await pickVaultFolder();
    if (p) {
      // User picks a parent dir; append the slug for the actual vault root.
      const slug =
        name
          .trim()
          .replace(/[^a-zA-Z0-9-_ ]/g, "")
          .replace(/\s+/g, "-") || "Vault";
      const sep = p.includes("\\") ? "\\" : "/";
      setFolder(`${p}${p.endsWith(sep) ? "" : sep}${slug}`);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const root = folder.trim();
    if (!root) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await getClient().initVault(root, name.trim() || undefined);
      onOpened(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardCard
      icon={<FolderPlusIcon className="h-5 w-5 text-accent" />}
      title="Create a new vault"
      subtitle="Lattice will create the folder, drop a starter note, and open it for you."
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Vault name" hint="Just for display — you can change this later.">
          <input
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Vault"
            autoFocus
          />
        </Field>
        <Field
          label="Location"
          hint={
            tauri
              ? "Pick a parent folder — Lattice will create a new subfolder inside."
              : "Enter the absolute path where the vault should live. The folder must not exist or be empty."
          }
        >
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1 font-mono text-[12.5px]"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder={tauri ? "/Users/you/Documents/My-Vault" : "/absolute/path/to/new-vault"}
            />
            {tauri && (
              <button type="button" onClick={pickFolder} className="btn btn-secondary shrink-0">
                Choose folder
              </button>
            )}
          </div>
        </Field>

        {error && (
          <div className="rounded-md bg-danger-soft text-danger px-3 py-2 text-[12.5px]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            ← Back
          </button>
          <button type="submit" disabled={!folder.trim() || busy} className="btn btn-primary">
            {busy ? (
              "Creating…"
            ) : (
              <>
                Create vault <ArrowRightIcon className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </WizardCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  Open existing                                                             */
/* -------------------------------------------------------------------------- */

function OpenVault({
  onCancel,
  onOpened,
}: {
  onCancel: () => void;
  onOpened: (resp: OpenVaultResponse) => void;
}) {
  const tauri = isTauri();
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFolder() {
    const p = await pickVaultFolder();
    if (p) setFolder(p);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!folder.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await getClient().openVault(folder.trim());
      onOpened(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardCard
      icon={<FolderIcon className="h-5 w-5 text-fg-default" />}
      title="Open an existing folder"
      subtitle="Point at any folder of Markdown files — Obsidian vaults work, plain folders work, your Foam graph works."
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Folder path"
          hint="The folder will be scanned and indexed in the background — large vaults may take a minute the first time."
        >
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1 font-mono text-[12.5px]"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="/path/to/your-notes"
              autoFocus
            />
            {tauri && (
              <button type="button" onClick={pickFolder} className="btn btn-secondary shrink-0">
                Choose folder
              </button>
            )}
          </div>
        </Field>

        {error && (
          <div className="rounded-md bg-danger-soft text-danger px-3 py-2 text-[12.5px]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            ← Back
          </button>
          <button type="submit" disabled={!folder.trim() || busy} className="btn btn-primary">
            {busy ? (
              "Opening…"
            ) : (
              <>
                Open vault <ArrowRightIcon className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </WizardCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  Connect cloud                                                             */
/* -------------------------------------------------------------------------- */

function ConnectCloud({ onCancel }: { onCancel: () => void }) {
  return (
    <WizardCard
      icon={<CloudIcon className="h-5 w-5 text-fg-default" />}
      title="Connect to Lattice Cloud"
      subtitle="Sign in with a magic link to sync across devices and give agents secure access via hosted MCP."
      onCancel={onCancel}
    >
      <div className="space-y-4">
        <ul className="space-y-3 text-[13px] text-fg-muted">
          <li className="flex gap-3">
            <CommandIcon className="h-4 w-4 mt-0.5 text-accent shrink-0" />
            <span>Sign in via one-time email link — no password to remember.</span>
          </li>
          <li className="flex gap-3">
            <CommandIcon className="h-4 w-4 mt-0.5 text-accent shrink-0" />
            <span>Approve devices (CLI, desktop, mobile) with a 4-digit code.</span>
          </li>
          <li className="flex gap-3">
            <CommandIcon className="h-4 w-4 mt-0.5 text-accent shrink-0" />
            <span>Issue scoped tokens for Claude, Cursor, or custom agents.</span>
          </li>
        </ul>
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            ← Back
          </button>
          <a href="/login" className="btn btn-primary">
            Continue to sign-in <ArrowRightIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </WizardCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared wizard chrome                                                      */
/* -------------------------------------------------------------------------- */

function WizardCard({
  icon,
  title,
  subtitle,
  onCancel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-xl animate-scale-in">
      <div className="card-elevated p-6 md:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-semibold tracking-tight text-fg-default">{title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{subtitle}</p>
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-3 text-center text-[11px] text-fg-faint">
        Press <kbd className="kbd">Esc</kbd> to go back at any time.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-fg-default mb-1.5">{label}</span>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-fg-muted leading-relaxed">{hint}</p>}
    </label>
  );
}
