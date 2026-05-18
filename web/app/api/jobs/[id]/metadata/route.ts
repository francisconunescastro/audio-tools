import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { readStatus, outputDir } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns a merged payload describing everything the pipeline produced:
//
//   {
//     chordChart: { … contents of *_chord_chart.json … } | null,
//     stems:      { vocals: { present, rms_dbfs_peak, loud_seconds }, … } | null,
//     files: {
//       pdf:           "<input_base>/<input_base>_chord_chart.pdf"           | null,
//       musicxml:      "<input_base>/<input_base>_chord_chart.musicxml"      | null,
//       stabilizedWav: "<input_base>/<input_base>_stabilised.wav"            | null,
//       chartJson:     "<input_base>/<input_base>_chord_chart.json"          | null,
//       stems:         { vocals: "<input_base>/<input_base>_stems/vocals.wav", … }
//     }
//   }
//
// File paths are relative to the job's output dir; the done page passes
// them to /api/jobs/[id]/file?name=<path> for inline playback / download.
//
// pipeline.py writes everything one level deep under output/:
//
//   <job>/output/<input_base>/{...}.wav, {...}.pdf, etc.
//   <job>/output/<input_base>/<input_base>_stems/{vocals,drums,...}.wav
//
// So we look inside whichever first-level subfolder of output/ exists.

type StemInfo = { present: boolean; rms_dbfs_peak: number; loud_seconds: number };

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function findFirstSubdir(dir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) return e.name;
    }
  } catch {
    /* dir missing */
  }
  return null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const status = await readStatus(params.id);
  if (!status) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const out = outputDir(params.id);
  const inputBase = await findFirstSubdir(out);
  if (!inputBase) {
    return NextResponse.json({ chordChart: null, stems: null, files: emptyFiles() });
  }

  const stageDir = path.join(out, inputBase);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(stageDir);
  } catch {
    return NextResponse.json({ chordChart: null, stems: null, files: emptyFiles() });
  }

  const pdf            = entries.find((e) => e.endsWith("_chord_chart.pdf"))      ?? null;
  const pdfPreview     = entries.find((e) => e.endsWith("_chord_chart_preview.png")) ?? null;
  const musicxml       = entries.find((e) => e.endsWith("_chord_chart.musicxml")) ?? null;
  const chartJsonName  = entries.find((e) => e.endsWith("_chord_chart.json"))     ?? null;
  // "*_stabilised.wav" — but not the ".bpm" sidecar
  const stabilizedWav  = entries.find((e) => e.endsWith("_stabilised.wav"))       ?? null;
  const backingTrackWav = entries.find((e) => e.endsWith("_backing_track.wav"))   ?? null;
  const stemsDirName   = entries.find((e) => e.endsWith("_stems"))                ?? null;

  // Parse the chord-chart JSON for the analysis card.
  const chordChart = chartJsonName
    ? await readJsonIfExists<Record<string, unknown>>(path.join(stageDir, chartJsonName))
    : null;

  // Parse the stems_info.json + enumerate per-stem WAVs.
  let stems: Record<string, StemInfo> | null = null;
  const stemFiles: Record<string, string> = {};
  if (stemsDirName) {
    const stemsDir = path.join(stageDir, stemsDirName);
    try {
      const stemEntries = await fs.readdir(stemsDir);
      const wavs = stemEntries.filter((e) => e.endsWith(".wav"));
      for (const w of wavs) {
        const name = w.replace(/\.wav$/, "");
        stemFiles[name] = path.join(inputBase, stemsDirName, w);
      }
    } catch {
      /* no stems dir */
    }
    const info = await readJsonIfExists<{ stems?: Record<string, StemInfo> }>(
      path.join(stemsDir, "stems_info.json"),
    );
    stems = info?.stems ?? null;
  }

  return NextResponse.json({
    chordChart,
    stems,
    files: {
      pdf:           pdf            ? path.join(inputBase, pdf)           : null,
      pdfPreview:    pdfPreview     ? path.join(inputBase, pdfPreview)    : null,
      musicxml:      musicxml       ? path.join(inputBase, musicxml)      : null,
      stabilizedWav: stabilizedWav  ? path.join(inputBase, stabilizedWav) : null,
      chartJson:     chartJsonName  ? path.join(inputBase, chartJsonName) : null,
      backingTrack:  backingTrackWav ? path.join(inputBase, backingTrackWav) : null,
      stems:         stemFiles,
    },
  });
}

function emptyFiles() {
  return {
    pdf: null,
    pdfPreview: null,
    musicxml: null,
    stabilizedWav: null,
    chartJson: null,
    backingTrack: null,
    stems: {} as Record<string, string>,
  };
}
