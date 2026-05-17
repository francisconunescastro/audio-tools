import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { readStatus, outputDir } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the merged structured metadata produced by the pipeline:
//
//   {
//     chordChart: { … contents of *_chord_chart.json … } | null,
//     stems:      { vocals: { present, rms_dbfs_peak, loud_seconds }, … } | null,
//   }
//
// The done page uses this to label silent / bleed-only stems honestly and to
// surface section info beyond what status.json carries.
//
// Returns 404 if the job doesn't exist; returns an empty object (200) if the
// job exists but no metadata files have been written yet (e.g. it errored
// before stems were split).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const status = await readStatus(params.id);
  if (!status) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const out = outputDir(params.id);

  // The chord-chart JSON is named "<basename>_chord_chart.json".  We don't
  // know the basename so glob for the suffix.
  let chordChart: unknown = null;
  let stems: unknown = null;
  try {
    const entries = await fs.readdir(out);
    const chordFile = entries.find((e) => e.endsWith("_chord_chart.json"));
    if (chordFile) {
      const raw = await fs.readFile(path.join(out, chordFile), "utf8");
      chordChart = JSON.parse(raw);
    }
    // Stems info lives under output/<basename>_stems/stems_info.json — that's
    // pipeline.py's default. Look for any *_stems/stems_info.json child.
    const stemsDir = entries.find((e) => e.endsWith("_stems"));
    if (stemsDir) {
      try {
        const raw = await fs.readFile(path.join(out, stemsDir, "stems_info.json"), "utf8");
        const parsed = JSON.parse(raw) as { stems?: Record<string, unknown> };
        stems = parsed.stems ?? null;
      } catch {
        // No stems_info.json (older runs or stems skipped) — leave null.
      }
    }
  } catch {
    // outputDir doesn't exist yet
  }

  return NextResponse.json({ chordChart, stems });
}
