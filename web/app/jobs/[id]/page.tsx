"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = {
  id: string;
  state: "queued" | "running" | "done" | "error";
  pct: number;
  stage: string;
  filename: string;
  elapsedMs: number;
  error: { exitCode: number | null; stderrTail: string } | null;
};

const STAGE_LABELS: Record<string, string> = {
  queued:    "Waiting in queue…",
  start:     "Starting…",
  stabilize: "Stabilizing beats…",
  chord:     "Generating chord chart…",
  stems:     "Splitting stems…",
  done:      "Done",
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function ProcessingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tick, setTick] = useState(0); // forces elapsed re-render
  const finishedRef = useRef(false);

  // Poll status every 1s while not finished.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${params.id}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as Status;
        if (cancelled) return;
        setStatus(data);
        if (data.state === "done") {
          finishedRef.current = true;
          router.replace(`/jobs/${params.id}/done`);
        }
      } catch {
        // network blip — keep polling
      }
    }
    void poll();
    const id = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [params.id, router]);

  // Tick the elapsed clock every second.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Warn before unload while processing.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (finishedRef.current) return;
      if (status?.state === "running" || status?.state === "queued") {
        e.preventDefault();
        e.returnValue = "Processing is still running. If you leave, the page won't be able to track it.";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status?.state]);

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Job not found</h1>
          <p className="text-sm text-neutral-500 mb-4">It may have been cleaned up after 24 hours.</p>
          <a href="/" className="text-blue-600 hover:underline">Back to upload</a>
        </div>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-neutral-500">Loading job…</p>
      </main>
    );
  }

  if (status.state === "error") {
    return <ErrorView status={status} />;
  }

  // `tick` is read to force a re-render every second so the elapsed clock advances
  // between status polls; the value itself isn't used.
  void tick;

  const label = STAGE_LABELS[status.stage] ?? status.stage;
  const pct = Math.max(0, Math.min(100, status.pct));

  return (
    <main className="min-h-screen flex justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Processing…</h1>
          <p className="text-sm text-neutral-500 font-mono break-all">{status.filename}</p>
        </header>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-base">{label}</span>
            <span className="font-mono tabular-nums text-sm">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Elapsed: {formatElapsed(status.elapsedMs)}</span>
            <span className="font-mono">{status.state}</span>
          </div>
        </div>

        <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 px-4 py-3 text-sm">
          <strong>Don't close this tab.</strong> Processing runs server-side, but if you leave this page you'll lose the progress view and the download link.
        </div>
      </div>
    </main>
  );
}

function ErrorView({ status }: { status: Status }) {
  return (
    <main className="min-h-screen flex justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The pipeline failed processing <span className="font-mono">{status.filename}</span>
          {status.error?.exitCode !== null && status.error?.exitCode !== undefined && (
            <span> (exit {status.error.exitCode})</span>
          )}.
        </p>
        <pre className="max-h-96 overflow-auto rounded-lg bg-neutral-900 text-neutral-100 text-xs p-4 font-mono whitespace-pre-wrap">
          {status.error?.stderrTail || "(no stderr captured)"}
        </pre>
        <a
          href="/"
          className="inline-block rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm"
        >
          Try again
        </a>
      </div>
    </main>
  );
}
