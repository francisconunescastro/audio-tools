"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DropZone } from "@/components/DropZone";
import {
  AdvancedSettings,
  DEFAULT_ADVANCED,
  toSettingsPayload,
  type AdvancedState,
} from "@/components/AdvancedSettings";

const STORAGE_KEY = "audio-tools.advanced.v1";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedState>(DEFAULT_ADVANCED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rehydrate Advanced Settings from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AdvancedState>;
      setAdvanced((current) => ({ ...current, ...parsed }));
    } catch {
      // bad/missing JSON → keep defaults
    }
  }, []);

  // Persist on change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(advanced));
    } catch {
      // quota/private mode → silently skip
    }
  }, [advanced]);

  async function onSubmit() {
    if (!file) return;
    setBusy(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("settings", JSON.stringify(toSettingsPayload(advanced)));

    try {
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Upload failed (${res.status}).`);
        setBusy(false);
        return;
      }
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-semibold">audio-tools</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Drop an audio file. Get back a beat-stabilized WAV, a chord chart PDF, and isolated stems — packaged as a ZIP.
          </p>
        </header>

        <DropZone file={file} onFile={setFile} disabled={busy} />

        <AdvancedSettings value={advanced} onChange={setAdvanced} disabled={busy} />

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={onSubmit}
          disabled={!file || busy}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-800 text-white font-medium px-4 py-3 transition-colors"
        >
          {busy ? "Uploading…" : "Process audio"}
        </button>

        <p className="text-xs text-neutral-500 text-center">
          Files are processed locally on your machine. Job artifacts are deleted after 24 hours.
        </p>
      </div>
    </main>
  );
}
