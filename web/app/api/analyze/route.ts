import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { v4 as uuid } from "uuid";

import { REPO_ROOT } from "@/lib/jobs";
import { validateUpload, sanitizeFilename } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quick-analyze endpoint. Runs the lightweight librosa-based detector in
// venv_crema's Python 3.11 so the upload page can pre-fill BPM / key / meter
// before the user reviews & confirms.
//
//   POST  multipart/form-data
//     - file: audio (must pass validateUpload)
//
//   200  { bpm: number | null, key: string | null, timeSig: string | null,
//          durationSeconds: number, filename: string }
//
// The file is staged in a per-request temp dir and deleted after analysis
// regardless of outcome — we don't want orphan uploads piling up in tmpdir.
// The real upload to /api/jobs re-sends the bytes; on localhost that's
// effectively free, and it keeps this endpoint stateless.

const ANALYZE_TIMEOUT_MS = 90_000; // hard cap; long files take longer

type AnalyzePayload = {
  bpm: number | null;
  key: string | null;
  time_sig: string | null;
  duration_seconds: number;
};

function resolveAnalyzePython(): string {
  // venv_crema is the lightest Python we have that has librosa+soundfile+
  // numpy AND is new enough (3.11) for the type annotations in chord_sheet.py.
  return path.join(REPO_ROOT, "venv_crema", "bin", "python3.11");
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }

  const validation = validateUpload({ name: file.name, size: file.size });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message }, { status: validation.status });
  }

  // Stage the bytes in a temp dir that's cleaned up before we return.
  const stagingRoot = path.join(os.tmpdir(), "audio-tools-analyze");
  await fs.mkdir(stagingRoot, { recursive: true });
  const stagingDir = path.join(stagingRoot, uuid());
  await fs.mkdir(stagingDir, { recursive: true });
  const safeName = sanitizeFilename(file.name.slice(0, file.name.length - validation.ext.length) || "input");
  const inputPath = path.join(stagingDir, `${safeName}${validation.ext}`);
  await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

  try {
    const result = await runAnalyzer(inputPath);
    return NextResponse.json({
      bpm:             result.bpm,
      key:             result.key,
      timeSig:         result.time_sig,
      durationSeconds: result.duration_seconds,
      filename:        file.name,
    });
  } catch (err) {
    // Analysis failure shouldn't block the upload flow; surface so the
    // client can still show an empty Song info panel.
    return NextResponse.json({
      bpm:             null,
      key:             null,
      timeSig:         null,
      durationSeconds: 0,
      filename:        file.name,
      error:           err instanceof Error ? err.message : String(err),
    });
  } finally {
    void fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runAnalyzer(inputPath: string): Promise<AnalyzePayload> {
  return new Promise((resolve, reject) => {
    const py = resolveAnalyzePython();
    const script = path.join(REPO_ROOT, "quick_analyze.py");

    const child = spawn(py, [script, "-i", inputPath], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Analysis timed out"));
    }, ANALYZE_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`quick_analyze.py exited ${code}: ${stderr.slice(-400)}`));
        return;
      }
      const lastLine = stdout.trim().split("\n").pop() ?? "";
      try {
        resolve(JSON.parse(lastLine) as AnalyzePayload);
      } catch (e) {
        reject(new Error(`Could not parse analyzer JSON: ${e}`));
      }
    });

    child.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}
