"use client";

import { useEffect, useState } from "react";
import { Breadcrumb } from "../../../components/Breadcrumb";
import { CheckIcon } from "../../../components/icons";
import { getApiUrl, setApiUrl } from "../../../lib/client";

/**
 * Settings → API endpoint. Lets a user (especially on iOS/Android) point the
 * app at a custom Lattice API host without rebuilding.
 */
export default function ApiSettingsPage() {
  const [value, setValue] = useState("");
  const [current, setCurrent] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCurrent(getApiUrl());
    setValue(getApiUrl());
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setApiUrl(value.trim() || null);
    setCurrent(value.trim() || getApiUrl());
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function reset() {
    setApiUrl(null);
    const url = getApiUrl();
    setCurrent(url);
    setValue(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <main className="min-h-screen bg-canvas">
      <Breadcrumb trail={[{ label: "Settings" }, { label: "API endpoint" }]} />

      <div className="mx-auto max-w-2xl px-6 py-10 animate-fade-in">
        <header>
          <h1 className="text-section">API endpoint</h1>
          <p className="mt-2 text-meta">
            Point this client at a custom Lattice API host. Useful for mobile builds talking to a
            cloud deployment, or for testing against a staging API without rebuilding the app.
            Stored in your browser's local storage — only this device is affected.
          </p>
        </header>

        <form onSubmit={save} className="card mt-6 p-5 space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium text-fg-default mb-2">URL</span>
            <input
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://cloud.lattice.example"
              className="input font-mono text-[13px]"
            />
            <p className="mt-2 text-[12px] text-fg-muted">
              Currently: <span className="font-mono">{current}</span>
            </p>
          </label>

          <div className="flex items-center justify-between">
            <button type="button" onClick={reset} className="btn btn-ghost btn-sm">
              Reset to default
            </button>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="inline-flex items-center gap-1 text-[12px] text-success animate-fade-in">
                  <CheckIcon className="h-4 w-4" /> Saved
                </span>
              )}
              <button type="submit" className="btn btn-primary btn-sm">
                Save
              </button>
            </div>
          </div>
        </form>

        <p className="mt-6 text-caption">
          Setting this on iOS/Android: after install, visit{" "}
          <span className="font-mono">/settings/api</span> inside the app and paste your cloud URL,
          then reload. See <span className="font-mono">docs/mobile.md</span> in the repo for the
          full mobile build path.
        </p>
      </div>
    </main>
  );
}
