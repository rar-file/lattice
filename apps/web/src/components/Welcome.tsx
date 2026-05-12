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
} from "./icons";

type Step = "intro" | "create" | "open" | "cloud";

interface Props {
  onOpened: (resp: OpenVaultResponse) => void;
}

/**
 * Vault chooser. Shown only when the auto-open path fails (cloud mode, refused
 * permissions, or the user explicitly closed their default vault). For the
 * first-launch case the server creates ``~/Documents/Lattice`` automatically
 * and the user lands straight in the workspace — so this screen exists as a
 * recovery dialog, not a marketing landing page.
 */
export function Welcome({ onOpened }: Props) {
  const [step, setStep] = useState<Step>("intro");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center text-center mb-7">
          <LatticeMark withWordmark={false} size={44} />
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-fg-default">
            Choose a vault
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted max-w-xs">
            Pick where Lattice should keep your notes. You can switch vaults any time from the
            workspace menu.
          </p>
        </div>

        {step === "intro" && <Intro onPick={setStep} />}
        {step === "create" && <CreateVault onCancel={() => setStep("intro")} onOpened={onOpened} />}
        {step === "open" && <OpenVault onCancel={() => setStep("intro")} onOpened={onOpened} />}
        {step === "cloud" && <ConnectCloud onCancel={() => setStep("intro")} />}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Intro — hero + 3 choices                                                  */
/* -------------------------------------------------------------------------- */

function Intro({ onPick }: { onPick: (s: Step) => void }) {
  return (
    <div className="card-elevated divide-y divide-border-subtle overflow-hidden">
      <ChoiceRow
        icon={<FolderPlusIcon className="h-4 w-4" />}
        title="Create a new vault"
        desc="Fresh folder, seeded with a starter note."
        onClick={() => onPick("create")}
      />
      <ChoiceRow
        icon={<FolderIcon className="h-4 w-4" />}
        title="Open an existing folder"
        desc="Any folder of Markdown — Obsidian, Foam, plain notes."
        onClick={() => onPick("open")}
      />
      <ChoiceRow
        icon={<CloudIcon className="h-4 w-4" />}
        title="Connect a cloud account"
        desc="Sync across devices and authorize agents."
        onClick={() => onPick("cloud")}
      />
    </div>
  );
}

function ChoiceRow({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken focus-ring"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sunken text-fg-muted group-hover:text-fg-default">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-fg-default">{title}</span>
        <span className="block text-[11.5px] text-fg-muted">{desc}</span>
      </span>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-fg-faint group-hover:text-fg-default" />
    </button>
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
  const [name, setName] = useState("My Vault");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Server picks a folder under ~/Documents/<slug>, auto-suffixed if taken.
      const resp = await getClient().initVault(null, name.trim());
      onOpened(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardCard
      icon={<FolderPlusIcon className="h-4 w-4" />}
      title="Create a new vault"
      subtitle="Lattice picks the folder — you just pick the name."
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Vault name"
          hint="The folder will be created inside your Documents directory."
        >
          <input
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Vault"
            autoFocus
          />
        </Field>

        {error && (
          <div className="rounded-md bg-danger-soft text-danger px-3 py-2 text-[12.5px]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            ← Back
          </button>
          <button type="submit" disabled={!name.trim() || busy} className="btn btn-primary">
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
    <div className="card-elevated animate-scale-in p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sunken shrink-0 text-fg-default">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg-default">{title}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-faint hover:text-fg-default text-[11px] focus-ring rounded px-1.5 py-0.5"
        >
          Esc
        </button>
      </div>
      <div className="mt-5">{children}</div>
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
