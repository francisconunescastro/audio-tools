"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Status = {
  id: string;
  state: "queued" | "running" | "done" | "error";
  pct: number;
  filename: string;
  elapsedMs: number;
  startedAt: string;
  finishedAt: string | null;
};

type StemInfo = { present: boolean; rms_dbfs_peak: number; loud_seconds: number };

type Section = {
  label: string;
  start_bar: number;
  end_bar: number;
  start_time?: number;
  end_time?: number;
};

type ChordChart = {
  key?: string;
  time_signature?: string;
  bars?: number;
  title?: string;
  sections?: Section[];
  chord_identification?: {
    mean_confidence?: number;
    median_confidence?: number;
    low_confidence_pct?: number;
    chord_changes?: number;
  };
  alignment?: {
    detected_bpm?: number;
    bpm_source?: string;
    beat_count?: number;
    beat_interval_cv?: number;
  };
  madmom_fallback?: {
    enabled?: boolean;
    bars_substituted?: number;
  };
  key_snap?: {
    enabled?: boolean;
    bars_snapped?: number;
  };
};

type Files = {
  pdf: string | null;
  musicxml: string | null;
  stabilizedWav: string | null;
  chartJson: string | null;
  stems: Record<string, string>;
};

type Metadata = {
  chordChart: ChordChart | null;
  stems: Record<string, StemInfo> | null;
  files: Files;
};

// ---------- formatting helpers ----------

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s} s`;
  return `${m} min ${s.toString().padStart(2, "0")} s`;
}

function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function pct(n: number | undefined, digits = 0): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

// ---------- root page ----------

export default function DonePage({ params }: { params: { id: string } }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/jobs/${params.id}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) setStatus(await res.json());
      try {
        const m = await fetch(`/api/jobs/${params.id}/metadata`, { cache: "no-store" });
        if (m.ok) setMetadata(await m.json());
      } catch {
        // metadata is enhancement; the page still renders without it
      }
    })();
  }, [params.id]);

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Job not found</h1>
          <p className="text-sm text-neutral-500 mb-4">It may have been cleaned up after 24 hours.</p>
          <Link href="/" className="text-blue-600 hover:underline">Back to upload</Link>
        </div>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  const chart  = metadata?.chordChart ?? null;
  const stems  = metadata?.stems ?? null;
  const files  = metadata?.files ?? null;
  const jobId  = params.id;

  return (
    <main className="min-h-screen flex justify-center px-4 py-10">
      <div className="w-full max-w-3xl space-y-6">

        {/* Header */}
        <header className="text-center space-y-2">
          <div className="text-4xl">✓</div>
          <h1 className="text-2xl font-semibold">Analysis complete</h1>
          <p className="text-sm text-neutral-500 font-mono break-all">{status.filename}</p>
          <p className="text-xs text-neutral-500">
            Processed in {formatDuration(status.elapsedMs)}
            {status.finishedAt && <> · {new Date(status.finishedAt).toLocaleString()}</>}
          </p>
        </header>

        {/* Analysis summary card */}
        {chart && <AnalysisCard chart={chart} />}

        {/* Sections list */}
        {chart?.sections && chart.sections.length > 0 && (
          <SectionsCard sections={chart.sections} />
        )}

        {/* Chord chart files (PDF / MusicXML) */}
        {files && (files.pdf || files.musicxml) && (
          <ChordChartCard chart={chart} files={files} jobId={jobId} />
        )}

        {/* Stabilised audio preview + download */}
        {files?.stabilizedWav && (
          <StabilizedAudioCard jobId={jobId} relPath={files.stabilizedWav} />
        )}

        {/* Stems list with players */}
        {stems && Object.keys(stems).length > 0 && files && (
          <StemsCard stems={stems} stemFiles={files.stems} jobId={jobId} />
        )}

        {/* Download everything */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5 space-y-3 text-center">
          <a
            href={`/api/jobs/${jobId}/zip`}
            className="inline-block w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3"
          >
            Download everything (ZIP)
          </a>
          <p className="text-xs text-neutral-500">
            Includes stabilised WAV, chord chart PDF + MusicXML, every stem, and the analysis JSON.
          </p>
        </div>

        <div className="text-center pt-2">
          <Link
            href="/"
            className="inline-block text-sm text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400"
          >
            Process another file →
          </Link>
        </div>
      </div>
    </main>
  );
}

// ---------- sub-components ----------

function AnalysisCard({ chart }: { chart: ChordChart }) {
  const bpm = chart.alignment?.detected_bpm;
  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5">
      <h2 className="text-sm font-medium text-neutral-500 mb-3">What we detected</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Key"   value={chart.key ?? "—"} />
        <Stat label="Meter" value={chart.time_signature ?? "—"} />
        <Stat label="BPM"   value={bpm !== undefined ? String(Math.round(bpm)) : "—"} />
        <Stat label="Bars"  value={chart.bars !== undefined ? String(chart.bars) : "—"} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-mono mt-1">{value}</div>
    </div>
  );
}

function SectionsCard({ sections }: { sections: Section[] }) {
  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5">
      <h2 className="text-sm font-medium text-neutral-500 mb-3">Song sections</h2>
      <ul className="space-y-1 text-sm">
        {sections.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-3 font-mono">
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded border border-neutral-300 dark:border-neutral-700 font-semibold">
                {s.label}
              </span>
              <span className="text-neutral-700 dark:text-neutral-300">
                Bars {s.start_bar}–{s.end_bar}
              </span>
            </span>
            <span className="text-neutral-500">
              {formatTime(s.start_time)} – {formatTime(s.end_time)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500 pt-3">
        Same letter = repeated section (e.g. A returning as the outro). Auto-detected from the audio.
      </p>
    </section>
  );
}

function ChordChartCard({
  chart,
  files,
  jobId,
}: {
  chart: ChordChart | null;
  files: Files;
  jobId: string;
}) {
  const ci = chart?.chord_identification;
  const fb = chart?.madmom_fallback;
  const ks = chart?.key_snap;
  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Chord chart</h2>
        <div className="flex gap-2">
          {files.pdf && (
            <DownloadButton jobId={jobId} relPath={files.pdf} label="Download PDF" />
          )}
          {files.musicxml && (
            <DownloadButton jobId={jobId} relPath={files.musicxml} label="Download MusicXML" />
          )}
        </div>
      </div>

      {files.pdf && (
        <iframe
          src={`/api/jobs/${jobId}/file?name=${encodeURIComponent(files.pdf)}#view=FitH`}
          className="w-full h-96 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950"
          title="Chord chart preview"
        />
      )}

      {ci && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400 pt-1">
          <div className="flex justify-between"><dt>Mean confidence</dt>      <dd className="font-mono">{pct(ci.mean_confidence)}</dd></div>
          <div className="flex justify-between"><dt>Chord changes</dt>        <dd className="font-mono">{ci.chord_changes ?? "—"}</dd></div>
          <div className="flex justify-between"><dt>Low-confidence bars</dt>  <dd className="font-mono">{ci.low_confidence_pct?.toFixed(1) ?? "—"}%</dd></div>
          {fb?.enabled && (
            <div className="flex justify-between"><dt>Madmom-corrected bars</dt><dd className="font-mono">{fb.bars_substituted ?? 0}</dd></div>
          )}
          {ks?.enabled && (
            <div className="flex justify-between"><dt>Key-snapped bars</dt>     <dd className="font-mono">{ks.bars_snapped ?? 0}</dd></div>
          )}
        </dl>
      )}
    </section>
  );
}

function StabilizedAudioCard({ jobId, relPath }: { jobId: string; relPath: string }) {
  const src = `/api/jobs/${jobId}/file?name=${encodeURIComponent(relPath)}`;
  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Stabilised audio</h2>
        <DownloadButton jobId={jobId} relPath={relPath} label="Download WAV" />
      </div>
      <audio controls preload="metadata" className="w-full" src={src} />
      <p className="text-xs text-neutral-500">
        Beat-locked to a single tempo and trimmed so bar 1 is at the start —
        drop it into a DAW at the detected BPM and it lines up.
      </p>
    </section>
  );
}

function StemsCard({
  stems,
  stemFiles,
  jobId,
}: {
  stems: Record<string, StemInfo>;
  stemFiles: Record<string, string>;
  jobId: string;
}) {
  const order = ["vocals", "drums", "bass", "guitar", "piano", "other"];
  const known = order.filter((n) => stems[n]);
  const extras = Object.keys(stems).filter((n) => !order.includes(n));
  const all = [...known, ...extras];
  if (all.length === 0) return null;

  const presentCount = all.filter((n) => stems[n].present).length;
  const lowCount = all.length - presentCount;

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Stems</h2>
        <span className="text-xs text-neutral-500">
          {presentCount} present{lowCount > 0 && <> · {lowCount} low-energy</>}
        </span>
      </div>
      <ul className="space-y-3">
        {all.map((name) => (
          <StemRow
            key={name}
            name={name}
            info={stems[name]}
            relPath={stemFiles[name] ?? null}
            jobId={jobId}
          />
        ))}
      </ul>
      <p className="text-xs text-neutral-500">
        Low-energy stems are usually silent or model bleed — they're still in the ZIP, but the
        instrument probably isn't in the original mix.
      </p>
    </section>
  );
}

function StemRow({
  name,
  info,
  relPath,
  jobId,
}: {
  name: string;
  info: StemInfo;
  relPath: string | null;
  jobId: string;
}) {
  const src = relPath ? `/api/jobs/${jobId}/file?name=${encodeURIComponent(relPath)}` : null;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span aria-hidden className={info.present ? "text-green-600" : "text-amber-600"}>
            {info.present ? "●" : "○"}
          </span>
          <span className="font-mono capitalize">{name}</span>
          <span className={info.present
            ? "text-xs text-neutral-500"
            : "text-xs text-amber-700 dark:text-amber-400"}>
            {info.present
              ? `peak ${info.rms_dbfs_peak.toFixed(1)} dBFS · ${info.loud_seconds.toFixed(0)}s loud`
              : `low energy (peak ${info.rms_dbfs_peak.toFixed(1)} dBFS — likely silent or bleed)`}
          </span>
        </div>
        {relPath && (
          <DownloadButton jobId={jobId} relPath={relPath} label="Download" small />
        )}
      </div>
      {src && info.present && (
        <audio controls preload="none" className="w-full" src={src} />
      )}
    </li>
  );
}

function DownloadButton({
  jobId,
  relPath,
  label,
  small,
}: {
  jobId: string;
  relPath: string;
  label: string;
  small?: boolean;
}) {
  const href = `/api/jobs/${jobId}/file?name=${encodeURIComponent(relPath)}&download=1`;
  const sizeCls = small
    ? "px-2.5 py-1 text-xs"
    : "px-3 py-1.5 text-sm";
  return (
    <a
      href={href}
      className={`inline-block rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium ${sizeCls}`}
    >
      {label}
    </a>
  );
}
