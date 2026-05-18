"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, XCircle } from "lucide-react";

type TempoChangeDetails = {
  from_bpm?: number;
  to_bpm?: number;
  at_bar?: number;
  at_time_s?: number;
};

type Status = {
  id: string;
  state: "queued" | "running" | "done" | "error";
  pct: number;
  stage: string;
  filename: string;
  elapsedMs: number;
  lastUpdateMs: number;
  error: {
    exitCode: number | null;
    stderrTail: string;
    kind?: "tempo_change";
    details?: TempoChangeDetails;
  } | null;
};

const STAGE_LABELS: Record<string, string> = {
  queued:    "Waiting in queue",
  start:     "Starting up",
  stabilize: "Stabilizing beats",
  chord:     "Generating chord chart",
  stems:     "Splitting stems",
  finalize:  "Packaging download",
  done:      "Done",
};

const STALE_WARN_MS = 15_000;
const STALE_BAD_MS  = 60_000;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatAgo(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s ago`;
}

export default function ProcessingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tick, setTick] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${params.id}`, { cache: "no-store" });
        if (res.status === 404) { if (!cancelled) setNotFound(true); return; }
        if (!res.ok) return;
        const data = (await res.json()) as Status;
        if (cancelled) return;
        setStatus(data);
        if (data.state === "done") {
          finishedRef.current = true;
          router.replace(`/jobs/${params.id}/done`);
        }
      } catch { /* network blip */ }
    }
    void poll();
    const id = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [params.id, router]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (finishedRef.current) return;
      if (status?.state === "running" || status?.state === "queued") {
        e.preventDefault();
        e.returnValue = "Processing is still running.";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status?.state]);

  async function handleCancel() {
    if (cancelling) return;
    const ok = window.confirm("Cancel this job? Processing will be killed and cannot be resumed.");
    if (!ok) return;
    setCancelling(true);
    try {
      await fetch(`/api/jobs/${params.id}/cancel`, { method: "POST" });
    } catch { /* ignore */ } finally {
      setCancelling(false);
    }
  }

  if (notFound) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <h1 className="font-display text-[36px] font-bold text-ebony leading-none">Not found</h1>
          <p className="font-inter text-sm text-[#6D6D6D]">This job may have been cleaned up after 24 hours.</p>
          <a href="/" className="inline-flex items-center font-season text-sm font-semibold text-ebony underline underline-offset-2">
            Back to upload
          </a>
        </div>
      </Shell>
    );
  }

  if (!status) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-[#888888]">
          <Spinner />
          <span className="font-inter text-sm">Loading job…</span>
        </div>
      </Shell>
    );
  }

  if (status.state === "error") {
    return <ErrorView status={status} />;
  }

  void tick;
  const liveLastUpdateMs = status.lastUpdateMs + (Date.now() % 1000);
  const inFinalize  = status.stage === "finalize";
  const isStale     = status.state === "running" && !inFinalize && status.lastUpdateMs > STALE_WARN_MS;
  const isVeryStale = status.state === "running" && !inFinalize && status.lastUpdateMs > STALE_BAD_MS;
  const label = STAGE_LABELS[status.stage] ?? status.stage;
  const pct   = Math.max(0, Math.min(100, status.pct));

  return (
    <Shell>
      <div className="space-y-6">

        {/* Header */}
        <header className="space-y-1">
          <span className="inline-flex items-center bg-brand-yellow text-ebony font-inter text-[10px] font-medium uppercase tracking-[0.12em] px-3 py-1 rounded-full">
            Processing
          </span>
          <h1 className="font-display text-[36px] font-bold text-ebony leading-tight pt-2 line-clamp-3 break-all">
            {status.filename}
          </h1>
        </header>

        {/* Progress block */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-season text-base font-semibold text-ebony">{label}…</span>
            <span className="font-inter text-xs text-[#888888] tabular-nums">{pct.toFixed(0)}%</span>
          </div>

          {/* Progress bar — 4px, no rounding */}
          <div className="h-1 w-full bg-[#E7E5E0] overflow-hidden">
            <div
              className="h-full bg-ebony transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex justify-between font-inter text-xs text-[#B0B0B0] tabular-nums">
            <span>Elapsed: {formatElapsed(status.elapsedMs)}</span>
            <span>Last update: {formatAgo(liveLastUpdateMs)}</span>
          </div>
        </div>

        {/* Stale warnings */}
        {isVeryStale && (
          <div className="bg-brand-pink-50 border border-[#E7E5E0] border-l-4 border-l-brand-pink px-4 py-3 flex gap-3">
            <XCircle size={16} className="text-brand-pink flex-shrink-0 mt-0.5" />
            <div className="font-inter text-sm text-[#78293A] space-y-1">
              <p className="font-semibold">No updates for over a minute.</p>
              <p>The job may be stuck. Cancelling and retrying is usually safest.</p>
            </div>
          </div>
        )}
        {isStale && !isVeryStale && (
          <div className="bg-brand-yellow-50 border border-[#E7E5E0] border-l-4 border-l-[#F3A00D] px-4 py-3 flex gap-3">
            <AlertTriangle size={16} className="text-[#D77908] flex-shrink-0 mt-0.5" />
            <p className="font-inter text-sm text-[#774310]">
              Quiet for {Math.round(status.lastUpdateMs / 1000)}s. Beat detection and stem splitting can take a while on long files.
            </p>
          </div>
        )}

        {/* Status + cancel row */}
        <div className="bg-ivory border border-warm-100 px-4 py-3 flex items-center justify-between gap-3">
          <span className="font-inter text-xs text-[#888888]">
            State: <span className="font-mono text-ebony">{status.state}</span>
          </span>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className={[
              "font-season text-sm font-medium px-4 py-1.5 rounded-full transition-colors disabled:opacity-40",
              isVeryStale
                ? "bg-brand-pink text-white hover:bg-[#B94659]"
                : "border border-[#D1CFC5] text-[#454545] hover:bg-[#E7E5E0]",
            ].join(" ")}
          >
            {cancelling ? "Cancelling…" : "Cancel job"}
          </button>
        </div>

        {/* Don't-close notice */}
        <div className="bg-brand-yellow-50 border border-[#E7E5E0] border-l-4 border-l-brand-yellow px-4 py-3">
          <p className="font-inter text-sm text-[#774310]">
            <strong className="font-semibold">Keep this tab open.</strong> Processing runs server-side, but
            leaving this page will lose the download link.
          </p>
        </div>

      </div>
    </Shell>
  );
}

// ---------- error views ----------

function ErrorView({ status }: { status: Status }) {
  if (status.error?.kind === "tempo_change") {
    return <TempoChangeErrorView status={status} />;
  }
  return (
    <Shell>
      <div className="space-y-5">
        <header>
          <span className="inline-flex items-center bg-brand-pink text-white font-inter text-[10px] font-medium uppercase tracking-[0.12em] px-3 py-1 rounded-full">
            Error
          </span>
          <h1 className="font-display text-[36px] font-bold text-ebony leading-tight pt-2">
            Something went wrong
          </h1>
          <p className="font-inter text-sm text-[#6D6D6D] mt-1">
            Pipeline failed on <span className="font-mono text-ebony">{status.filename}</span>
            {status.error?.exitCode != null && <> (exit {status.error.exitCode})</>}.
          </p>
        </header>
        <pre className="bg-[#1C1B17] text-[#F4F3F1] font-mono text-xs p-4 overflow-auto max-h-80 whitespace-pre-wrap">
          {status.error?.stderrTail || "(no stderr captured)"}
        </pre>
        <a href="/" className="inline-flex font-season text-sm font-semibold bg-brand-yellow text-ebony px-5 py-2.5 rounded-full hover:bg-[#F3A00D] transition-colors">
          Try again
        </a>
      </div>
    </Shell>
  );
}

function TempoChangeErrorView({ status }: { status: Status }) {
  const d    = (status.error?.details ?? {}) as TempoChangeDetails;
  const from = d.from_bpm !== undefined ? Math.round(d.from_bpm) : null;
  const to   = d.to_bpm   !== undefined ? Math.round(d.to_bpm)   : null;
  const bar  = d.at_bar;
  const t    = d.at_time_s;

  return (
    <Shell>
      <div className="space-y-5">
        <header>
          <span className="inline-flex items-center bg-brand-yellow text-ebony font-inter text-[10px] font-medium uppercase tracking-[0.12em] px-3 py-1 rounded-full">
            Tempo change detected
          </span>
          <h1 className="font-display text-[36px] font-bold text-ebony leading-tight pt-2">
            This song has a tempo change
          </h1>
        </header>

        <div className="bg-brand-yellow-50 border border-[#E7E5E0] border-l-4 border-l-[#F3A00D] px-4 py-3 font-inter text-sm text-[#774310] space-y-2">
          {from !== null && to !== null && bar !== undefined ? (
            <p>
              Detected ~<strong>{from} BPM</strong> through bar <strong>{bar}</strong>,
              then ~<strong>{to} BPM</strong>
              {t !== undefined ? <> (≈ {t.toFixed(1)}s)</> : null}.
            </p>
          ) : (
            <p>A sustained tempo change was detected mid-song.</p>
          )}
          <p>
            Beat stabilization assumes a single tempo and would warp the audio incorrectly across the boundary.
          </p>
        </div>

        <div className="space-y-2 font-season text-sm text-[#454545]">
          <p className="font-semibold text-ebony">What to do:</p>
          <ul className="space-y-1 pl-4 list-disc">
            <li>
              <strong>Split the file</strong> at the boundary
              {t !== undefined ? <> (around {t.toFixed(1)}s)</> : null} and process each half separately.
            </li>
            <li>
              <strong>Proceed anyway</strong> — re-upload with <em>Allow tempo change</em> enabled in
              Advanced settings. The warp will be imperfect, but chords and stems will still process.
            </li>
          </ul>
        </div>

        <a href="/" className="inline-flex font-season text-sm font-semibold bg-brand-yellow text-ebony px-5 py-2.5 rounded-full hover:bg-[#F3A00D] transition-colors">
          Back to upload
        </a>

        <details className="font-inter text-xs text-[#888888]">
          <summary className="cursor-pointer">Show pipeline output</summary>
          <pre className="mt-2 bg-[#1C1B17] text-[#F4F3F1] p-3 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
            {status.error?.stderrTail || "(no stderr captured)"}
          </pre>
        </details>
      </div>
    </Shell>
  );
}

// ---------- shared layout ----------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white flex justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {children}
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block w-4 h-4 rounded-full border-2 border-[#D1CFC5] border-t-brand-yellow animate-spin"
    />
  );
}
