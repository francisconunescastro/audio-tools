"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DropZone } from "@/components/DropZone";
import { SongInfo } from "@/components/SongInfo";
import {
  AdvancedSettings,
  DEFAULT_ADVANCED,
  toSettingsPayload,
  type AdvancedState,
} from "@/components/AdvancedSettings";

const STORAGE_KEY = "audio-tools.advanced.v1";

// Fields that describe the *song*, not the user's processing preferences.
// On a new upload we overwrite these from the quick-analysis result so the
// panel reflects the new file. Everything else (strength, model, threshold
// knobs, etc.) survives across uploads — that's a user preference.
const SONG_FIELDS: Array<keyof AdvancedState> = [
  "title", "subtitle", "bpm", "key", "timeSig", "genre",
];

type AnalyzeResult = {
  bpm: number | null;
  key: string | null;
  timeSig: string | null;
  durationSeconds: number;
  filename: string;
  error?: string;
};

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedState>(DEFAULT_ADVANCED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const lastAnalyzedFileRef = useRef<File | null>(null);

  // Rehydrate Advanced Settings from localStorage on mount. We deliberately
  // include song-info fields here — they'll be overwritten as soon as a file
  // is picked and analysis returns.
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

  // Persist non-song fields only — song info is per-upload.
  useEffect(() => {
    try {
      const persisted: Partial<AdvancedState> = { ...advanced };
      for (const k of SONG_FIELDS) delete persisted[k];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // quota / private mode — silently skip
    }
  }, [advanced]);

  // Kick off quick analysis whenever a new file is picked (or cleared).
  useEffect(() => {
    if (!file) {
      lastAnalyzedFileRef.current = null;
      setAnalysis(null);
      setAnalyzing(false);
      return;
    }
    // Don't re-analyze the same File reference.
    if (lastAnalyzedFileRef.current === file) return;
    lastAnalyzedFileRef.current = file;

    let cancelled = false;
    setAnalyzing(true);
    setAnalysis(null);
    setError(null);

    void (async () => {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/analyze", { method: "POST", body: form });
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setError(`Quick analysis failed (${res.status}). ${text}`);
          setAnalysis({
            bpm: null, key: null, timeSig: null, durationSeconds: 0,
            filename: file.name,
          });
        } else {
          const data = (await res.json()) as AnalyzeResult;
          setAnalysis(data);
          // Overwrite song-info fields with detected values + filename-based title.
          const baseTitle = file.name.replace(/\.[^.]+$/, "");
          setAdvanced((current) => ({
            ...current,
            title:   baseTitle,
            key:     data.key     ?? "auto",
            bpm:     data.bpm     ? String(data.bpm) : "",
            timeSig: timeSigToDropdownValue(data.timeSig),
          }));
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error during analysis.");
        setAnalysis({
          bpm: null, key: null, timeSig: null, durationSeconds: 0,
          filename: file.name,
        });
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

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

  // Show the settings cards only after analysis returns. While analysing we
  // show a lightweight progress card so the user knows something is happening.
  const ready = file !== null && analysis !== null;
  const formDisabled = busy || analyzing;

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

        {analyzing && <AnalyzingCard filename={file?.name ?? ""} />}

        {ready && (
          <>
            {analysis?.error && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 px-4 py-3 text-sm">
                Auto-detection didn&apos;t complete — fill in the song info manually below.
              </div>
            )}
            <SongInfo value={advanced} onChange={setAdvanced} disabled={formDisabled} />
            <AdvancedSettings value={advanced} onChange={setAdvanced} disabled={formDisabled} />
          </>
        )}

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {file && (
          <button
            onClick={onSubmit}
            disabled={!ready || busy}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-800 text-white font-medium px-4 py-3 transition-colors"
          >
            {busy
              ? "Uploading…"
              : analyzing
                ? "Analyzing your file…"
                : "Process audio"}
          </button>
        )}

        <p className="text-xs text-neutral-500 text-center">
          Files are processed locally on your machine. Job artifacts are deleted after 24 hours.
        </p>
      </div>
    </main>
  );
}

// ---------- helpers ----------

// The analyzer reports time signature as "4/4", "3/4", "6/8", etc. The
// Song info <SongInfo> dropdown's `value` is just the numerator string
// ("4", "3", "6"). Map between them. "6/8" maps to "6" because the chord
// chart renderer treats numerator=6 as compound duple.
function timeSigToDropdownValue(s: string | null): string {
  if (!s) return "";
  const m = /^(\d+)\/(\d+)$/.exec(s);
  if (!m) return "";
  return m[1] === "6" && m[2] === "8" ? "6" : m[1];
}

function AnalyzingCard({ filename }: { filename: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4 flex items-center gap-3">
      <Spinner />
      <div className="text-sm">
        <div className="font-medium">Analyzing your file…</div>
        <div className="text-xs text-neutral-500 truncate">
          Quick BPM, key, and meter detection on {filename}. Usually 3–10 seconds.
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block w-4 h-4 rounded-full border-2 border-neutral-300 dark:border-neutral-700 border-t-blue-600 dark:border-t-blue-400 animate-spin"
    />
  );
}
