"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Music2, FileText, FileCode2, Mic2, Drum, Guitar, Piano, AudioLines, HelpCircle } from "lucide-react";

type Status = {
  id: string;
  state: "queued" | "running" | "done" | "error";
  pct: number;
  filename: string;
  elapsedMs: number;
  startedAt: string;
  finishedAt: string | null;
  settings?: { sessionType?: string };
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
  madmom_fallback?: { enabled?: boolean; bars_substituted?: number };
  key_snap?:        { enabled?: boolean; bars_snapped?: number };
};

type Files = {
  pdf: string | null;
  pdfPreview: string | null;
  musicxml: string | null;
  stabilizedWav: string | null;
  chartJson: string | null;
  backingTrack: string | null;
  stems: Record<string, string>;
};

type Metadata = {
  chordChart: ChordChart | null;
  stems: Record<string, StemInfo> | null;
  files: Files;
};

// ---------- helpers ----------

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m === 0 ? `${s}s` : `${m}m ${s.toString().padStart(2, "0")}s`;
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

// ---------- page ----------

export default function DonePage({ params }: { params: { id: string } }) {
  const [status,   setStatus]   = useState<Status   | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/jobs/${params.id}`, { cache: "no-store" });
      if (res.status === 404) { setNotFound(true); return; }
      if (res.ok) setStatus(await res.json());
      try {
        const m = await fetch(`/api/jobs/${params.id}/metadata`, { cache: "no-store" });
        if (m.ok) setMetadata(await m.json());
      } catch { /* enhancement only */ }
    })();
  }, [params.id]);

  if (notFound) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <h1 className="font-display text-[36px] font-bold text-ebony">Not found</h1>
          <p className="font-inter text-sm text-[#6D6D6D]">This job may have been cleaned up after 24 hours.</p>
          <Link href="/" className="font-season text-sm font-semibold underline underline-offset-2 text-ebony">
            Back to upload
          </Link>
        </div>
      </Shell>
    );
  }

  if (!status) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-[#888888]">
          <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-[#D1CFC5] border-t-brand-yellow animate-spin" />
          <span className="font-inter text-sm">Loading…</span>
        </div>
      </Shell>
    );
  }

  const chart = metadata?.chordChart ?? null;
  const stems = metadata?.stems       ?? null;
  const files = metadata?.files       ?? null;
  const jobId = params.id;

  return (
    <Shell>
      <div className="space-y-6">

        {/* Success header */}
        <header className="space-y-1">
          <span className="inline-flex items-center bg-brand-teal text-white font-inter text-[10px] font-medium uppercase tracking-[0.12em] px-3 py-1 rounded-full">
            Complete
          </span>
          <h1 className="font-display text-[48px] font-bold text-ebony leading-none pt-2">
            Your files are ready!
          </h1>
          <p className="font-inter text-sm text-[#6D6D6D]">
            {status.finishedAt
              ? new Date(status.finishedAt).toLocaleString()
              : null}
          </p>
          <p className="font-inter text-xs text-[#B0B0B0]">
            Processed in {formatDuration(status.elapsedMs)}
          </p>
        </header>

        {/* Stats */}
        {chart && <AnalysisCard chart={chart} />}

        {/* Section map */}
        {chart?.sections && chart.sections.length > 0 && (
          <SectionsCard sections={chart.sections} />
        )}

        {/* Chord chart */}
        {files && (files.pdf || files.musicxml) && (
          <ChordChartCard chart={chart} files={files} jobId={jobId} />
        )}

        {/* Stabilised audio */}
        {files?.stabilizedWav && (
          <StabilizedAudioCard jobId={jobId} relPath={files.stabilizedWav} />
        )}

        {/* Backing track */}
        {files?.backingTrack && (
          <BackingTrackCard
            jobId={jobId}
            relPath={files.backingTrack}
            sessionType={status.settings?.sessionType}
          />
        )}

        {/* Stems */}
        {stems && Object.keys(stems).length > 0 && files && (
          <StemsCard stems={stems} stemFiles={files.stems} jobId={jobId} />
        )}

        {/* Download all */}
        <div className="space-y-2 pt-2">
          <a
            href={`/api/jobs/${jobId}/zip`}
            className="flex items-center justify-center gap-2 w-full bg-ebony text-white font-season font-semibold text-base py-3.5 rounded-full hover:bg-[#222222] transition-colors"
          >
            <Download size={16} strokeWidth={2.5} />
            Download everything (ZIP)
          </a>
          <p className="font-inter text-xs text-[#888888] text-center">
            Stabilised WAV · chord chart PDF + MusicXML · stems · analysis JSON
          </p>
        </div>

        <div className="text-center pb-4">
          <Link
            href="/"
            className="font-inter text-sm text-[#888888] hover:text-ebony underline underline-offset-2 transition-colors"
          >
            Process another file
          </Link>
        </div>
      </div>
    </Shell>
  );
}

// ---------- section components ----------

function AnalysisCard({ chart }: { chart: ChordChart }) {
  const bpm = chart.alignment?.detected_bpm;
  return (
    <section className="bg-ivory border border-warm-100">
      <div className="px-5 pt-4 pb-1">
        <SectionLabel>Detected</SectionLabel>
      </div>
      <div className="grid grid-cols-4 divide-x divide-warm-100">
        <BigStat label="Key"   value={chart.key              ?? "—"} />
        <BigStat label="Meter" value={chart.time_signature   ?? "—"} />
        <BigStat label="BPM"   value={bpm !== undefined ? String(Math.round(bpm)) : "—"} />
        <BigStat label="Bars"  value={chart.bars !== undefined ? String(chart.bars) : "—"} />
      </div>
    </section>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-4 px-4 text-center space-y-0.5">
      <div className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">{label}</div>
      <div className="font-display text-2xl font-bold text-ebony">{value}</div>
    </div>
  );
}

function SectionsCard({ sections }: { sections: Section[] }) {
  return (
    <section className="bg-ivory border border-warm-100 px-5 py-4 space-y-3">
      <SectionLabel>Song sections</SectionLabel>
      <ul className="space-y-1">
        {sections.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-6 h-6 bg-ebony text-ivory font-inter text-[10px] font-semibold tracking-wide">
                {s.label}
              </span>
              <span className="font-season text-sm text-[#454545]">
                Bars {s.start_bar}–{s.end_bar}
              </span>
            </span>
            <span className="font-inter text-xs text-[#888888] tabular-nums">
              {formatTime(s.start_time)} – {formatTime(s.end_time)}
            </span>
          </li>
        ))}
      </ul>
      <p className="font-inter text-xs text-[#B0B0B0]">
        Same letter = repeated section. Auto-detected from the audio.
      </p>
    </section>
  );
}

function ChordChartCard({ chart, files, jobId }: { chart: ChordChart | null; files: Files; jobId: string }) {
  const ci = chart?.chord_identification;
  const fb = chart?.madmom_fallback;
  const ks = chart?.key_snap;

  return (
    <section className="bg-ivory border border-warm-100 px-5 py-4 space-y-4">
      <SectionLabel>Chord chart</SectionLabel>

      {/* PDF page-1 preview — falls back to a plain card if pymupdf didn't run */}
      {files.pdfPreview && files.pdf && (
        <a
          href={`/api/jobs/${jobId}/file?name=${encodeURIComponent(files.pdf)}`}
          target="_blank"
          rel="noopener"
          className="block w-full border border-warm-200 bg-white overflow-hidden"
          aria-label="Open chord chart PDF"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/jobs/${jobId}/file?name=${encodeURIComponent(files.pdfPreview)}`}
            alt="Chord chart preview (page 1)"
            className="block w-full h-auto"
          />
        </a>
      )}

      {/* Primary download CTAs — pill-shaped, PDF in black */}
      <div className="flex flex-wrap gap-2">
        {files.pdf && (
          <a
            href={`/api/jobs/${jobId}/file?name=${encodeURIComponent(files.pdf)}&download=1`}
            className="inline-flex items-center gap-2 bg-ebony text-white font-season text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-[#222222] transition-colors"
          >
            <FileText size={14} strokeWidth={2} />
            Download PDF
          </a>
        )}
        {files.musicxml && (
          <a
            href={`/api/jobs/${jobId}/file?name=${encodeURIComponent(files.musicxml)}&download=1`}
            className="inline-flex items-center gap-2 bg-white text-ebony border border-[#D1CFC5] font-season text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-warm-100 transition-colors"
          >
            <FileCode2 size={14} strokeWidth={2} />
            Download MusicXML
          </a>
        )}
      </div>

      {ci && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-inter text-xs text-[#6D6D6D] pt-1">
          <Row2 label="Mean confidence"    value={pct(ci.mean_confidence)} />
          <Row2 label="Chord changes"      value={String(ci.chord_changes ?? "—")} />
          <Row2 label="Low-confidence bars" value={`${ci.low_confidence_pct?.toFixed(1) ?? "—"}%`} />
          {fb?.enabled && <Row2 label="Madmom-corrected bars" value={String(fb.bars_substituted ?? 0)} />}
          {ks?.enabled && <Row2 label="Key-snapped bars"      value={String(ks.bars_snapped ?? 0)} />}
        </dl>
      )}
    </section>
  );
}

function Row2({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="font-mono text-ebony">{value}</dd>
    </div>
  );
}

function StabilizedAudioCard({ jobId, relPath }: { jobId: string; relPath: string }) {
  const src = `/api/jobs/${jobId}/file?name=${encodeURIComponent(relPath)}`;
  return (
    <section className="bg-ivory border border-warm-100 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Stabilised audio</SectionLabel>
        <DownloadButton jobId={jobId} relPath={relPath} label="WAV" icon={<Download size={13} strokeWidth={2} />} />
      </div>
      <audio controls preload="metadata" className="w-full" src={src} />
      <p className="font-inter text-xs text-[#B0B0B0]">
        Beat-locked to a single tempo, trimmed to bar 1 — drop into a DAW at the detected BPM.
      </p>
    </section>
  );
}

function BackingTrackCard({ jobId, relPath, sessionType }: { jobId: string; relPath: string; sessionType?: string }) {
  const src = `/api/jobs/${jobId}/file?name=${encodeURIComponent(relPath)}`;
  return (
    <section className="bg-ivory border border-warm-100 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SectionLabel>Backing track</SectionLabel>
          {sessionType && (
            <span className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] px-2.5 py-0.5 rounded-full bg-brand-teal text-white">
              minus {sessionType}
            </span>
          )}
        </div>
        <DownloadButton jobId={jobId} relPath={relPath} label="WAV" icon={<Download size={13} strokeWidth={2} />} />
      </div>
      <audio controls preload="metadata" className="w-full" src={src} />
      <p className="font-inter text-xs text-[#B0B0B0]">
        All stems mixed together
        {sessionType ? `, excluding ${sessionType}` : ""}
        — ready to practice or record against.
      </p>
    </section>
  );
}

const STEM_ICON: Record<string, React.ReactNode> = {
  vocals: <Mic2    size={14} strokeWidth={2} />,
  drums:  <Drum    size={14} strokeWidth={2} />,
  bass:   <Guitar  size={14} strokeWidth={2} />,
  guitar: <Guitar  size={14} strokeWidth={2} />,
  piano:  <Piano   size={14} strokeWidth={2} />,
  other:  <AudioLines size={14} strokeWidth={2} />,
};

function StemsCard({ stems, stemFiles, jobId }: { stems: Record<string, StemInfo>; stemFiles: Record<string, string>; jobId: string }) {
  const order = ["vocals", "drums", "bass", "guitar", "piano", "other"];
  const known  = order.filter((n) => stems[n]);
  const extras = Object.keys(stems).filter((n) => !order.includes(n));
  const all    = [...known, ...extras];
  if (all.length === 0) return null;

  const presentCount = all.filter((n) => stems[n].present).length;
  const lowCount     = all.length - presentCount;

  return (
    <section className="bg-ivory border border-warm-100 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Stems</SectionLabel>
        <span className="font-inter text-xs text-[#888888]">
          {presentCount} present{lowCount > 0 && ` · ${lowCount} low-energy`}
        </span>
      </div>
      <ul className="space-y-6">
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
      <p className="font-inter text-xs text-[#B0B0B0]">
        Low-energy stems are usually silent or model bleed — still in the ZIP.
      </p>
    </section>
  );
}

function StemRow({ name, info, relPath, jobId }: { name: string; info: StemInfo; relPath: string | null; jobId: string }) {
  const src = relPath ? `/api/jobs/${jobId}/file?name=${encodeURIComponent(relPath)}` : null;
  const icon = STEM_ICON[name] ?? <HelpCircle size={14} strokeWidth={2} />;

  return (
    <li className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={[
            "inline-flex items-center justify-center w-4 h-4 flex-shrink-0 self-center",
            info.present ? "text-ebony" : "text-[#B0B0B0]",
          ].join(" ")}>
            {icon}
          </span>
          <span className={[
            "font-season text-sm font-semibold capitalize",
            info.present ? "text-ebony" : "text-[#B0B0B0]",
          ].join(" ")}>{name}</span>
          <span className={[
            "font-inter text-xs truncate",
            info.present ? "text-[#888888]" : "text-[#B0B0B0]",
          ].join(" ")}>
            {info.present
              ? `${info.rms_dbfs_peak.toFixed(1)} dBFS · ${info.loud_seconds.toFixed(0)}s`
              : "low energy — likely silent or bleed"}
          </span>
        </div>
        {relPath && (
          <span className={info.present ? "" : "opacity-50"}>
            <DownloadButton jobId={jobId} relPath={relPath} label="WAV" icon={<Download size={11} strokeWidth={2} />} small />
          </span>
        )}
      </div>
      {src && info.present && (
        <audio controls preload="none" className="w-full" src={src} />
      )}
    </li>
  );
}

function DownloadButton({ jobId, relPath, label, icon, small }: { jobId: string; relPath: string; label: string; icon?: React.ReactNode; small?: boolean }) {
  const href = `/api/jobs/${jobId}/file?name=${encodeURIComponent(relPath)}&download=1`;
  return (
    <a
      href={href}
      className={[
        "inline-flex items-center gap-1.5 font-inter font-medium",
        "border border-[#D1CFC5] text-[#454545] hover:bg-white transition-colors",
        small ? "text-[10px] px-2 py-1" : "text-xs px-3 py-1.5",
      ].join(" ")}
    >
      {icon}
      {label}
    </a>
  );
}

// ---------- layout helpers ----------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white flex justify-center px-4 py-12">
      <div className="w-full max-w-2xl">{children}</div>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">
      {children}
    </p>
  );
}
