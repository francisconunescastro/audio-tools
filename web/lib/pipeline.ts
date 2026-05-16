import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  jobDir,
  outputDir,
  readStatus,
  stderrPath,
  updateStatus,
  zipPath,
  type JobStatus,
} from "./jobs";
import { zipDirectory } from "./zip";
import { REPO_ROOT } from "./jobs";
import type { Settings } from "./validation";

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  start: "Starting…",
  stabilize: "Stabilizing beats…",
  chord: "Generating chord chart…",
  stems: "Splitting stems…",
  done: "Done",
};

export function labelForStage(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

type SpawnedChild = ChildProcessByStdio<null, Readable, Readable>;
let activeChild: SpawnedChild | null = null;
let activeJobId: string | null = null;
const queue: string[] = [];

function settingsToArgs(s: Settings, outDir: string, inputPath: string): string[] {
  const args: string[] = [
    "pipeline.py",
    "-i", inputPath,
    "--output-dir", outDir,
    "--progress-json",
  ];

  if (s.title)                  args.push("--title", s.title);

  // Stabilizer
  if (s.skipStabilize)          args.push("--skip-stabilize");
  if (s.bpm)                    args.push("--bpm", String(s.bpm));
  if (s.strength !== undefined && s.strength !== 1.0) args.push("--strength", String(s.strength));
  if (s.trimIntro === false)    args.push("--no-trim-intro");
  if (s.beatsPerBar && s.beatsPerBar !== 4) args.push("--beats-per-bar", String(s.beatsPerBar));

  // Chord chart
  if (s.key && s.key !== "auto") args.push("--key", s.key);
  if (s.timeSig)                args.push("--time-sig", String(s.timeSig));
  if (s.barsPerLine && s.barsPerLine !== 4) args.push("--bars-per-line", String(s.barsPerLine));
  if (s.noBpm)                  args.push("--no-bpm");
  if (s.noKey)                  args.push("--no-key");
  if (s.noMeter)                args.push("--no-meter");
  if (s.subtitle !== undefined && s.subtitle !== "") args.push("--subtitle", s.subtitle);
  if (s.add7th)                 args.push("--add-7th");
  if (s.midBarThreshold !== undefined && s.midBarThreshold !== 0.80)
    args.push("--mid-bar-threshold", String(s.midBarThreshold));
  if (s.madmomFallback === false) args.push("--no-madmom-fallback");
  if (s.madmomThreshold !== undefined && s.madmomThreshold !== 0.70)
    args.push("--madmom-threshold", String(s.madmomThreshold));
  if (s.keyTiebreak)            args.push("--key-tiebreak");
  if (s.keySnap)                args.push("--key-snap");
  if (s.keySnapThreshold !== undefined && s.keySnapThreshold !== 0.65)
    args.push("--key-snap-threshold", String(s.keySnapThreshold));
  if (s.halfTime)               args.push("--half-time");
  if (s.compound)               args.push("--compound");

  // Stems
  if (s.skipStems)              args.push("--skip-stems");
  if (s.stems && s.stems.length > 0) args.push("--stems", s.stems.join(","));
  if (s.stemModel && s.stemModel !== "htdemucs_6s") args.push("--stem-model", s.stemModel);

  return args;
}

export function startOrQueue(id: string): void {
  if (activeJobId) {
    if (!queue.includes(id)) queue.push(id);
    return;
  }
  void runJob(id).catch(async (err) => {
    console.error("Job execution error", err);
    await updateStatus(id, {
      state: "error",
      error: { exitCode: null, stderrTail: String(err) },
      finishedAt: new Date().toISOString(),
    });
    activeJobId = null;
    activeChild = null;
    void pumpQueue();
  });
}

async function pumpQueue(): Promise<void> {
  const next = queue.shift();
  if (next) startOrQueue(next);
}

async function runJob(id: string): Promise<void> {
  const status = await readStatus(id);
  if (!status) return;

  activeJobId = id;

  const inputPath = path.join(jobDir(id), status.filename);
  const outDir = outputDir(id);
  await fs.mkdir(outDir, { recursive: true });

  const args = settingsToArgs(status.settings, outDir, inputPath);
  const stderrStream = createWriteStream(stderrPath(id), { flags: "a" });

  await updateStatus(id, { state: "running", pct: 0, stage: "start" });

  const child = spawn("python3", args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  }) as SpawnedChild;
  activeChild = child;

  // Stderr → log file
  child.stderr.pipe(stderrStream);

  // Stdout → parse PROGRESS lines
  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    stderrStream.write(line + "\n");
    if (line.startsWith("PROGRESS ")) {
      try {
        const payload = JSON.parse(line.slice("PROGRESS ".length)) as {
          stage?: string;
          pct?: number;
          msg?: string;
        };
        if (typeof payload.pct === "number") {
          const patch: Partial<JobStatus> = {
            pct: clamp(payload.pct, 0, 100),
          };
          if (payload.stage) patch.stage = payload.stage;
          void updateStatus(id, patch);
        }
      } catch {
        // ignore malformed
      }
    }
  });

  const exit: number = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });
  stderrStream.end();
  activeChild = null;

  if (exit === 0) {
    try {
      await fs.mkdir(outDir, { recursive: true });
      await zipDirectory(outDir, zipPath(id));
      await updateStatus(id, {
        state: "done",
        pct: 100,
        stage: "done",
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      await updateStatus(id, {
        state: "error",
        error: { exitCode: 0, stderrTail: `ZIP failed: ${err}` },
        finishedAt: new Date().toISOString(),
      });
    }
  } else {
    const tail = await tailFile(stderrPath(id), 40);
    await updateStatus(id, {
      state: "error",
      error: { exitCode: exit, stderrTail: tail },
      finishedAt: new Date().toISOString(),
    });
  }

  activeJobId = null;
  void pumpQueue();
}

async function tailFile(filePath: string, lines: number): Promise<string> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const all = raw.split("\n");
    return all.slice(Math.max(0, all.length - lines)).join("\n");
  } catch {
    return "";
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function isRunning(id: string): boolean {
  return activeJobId === id;
}
