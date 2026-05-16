import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Settings } from "./validation";

export const REPO_ROOT = path.resolve(process.cwd(), "..");

// Job artifacts (uploaded audio, per-job logs, output, ZIPs) live *outside*
// the repo so they don't pollute the working tree or risk being committed.
// Override with AUDIO_TOOLS_JOBS_DIR if you want a custom location.
// macOS:   /var/folders/.../T/audio-tools-jobs
// Linux:   /tmp/audio-tools-jobs
// The 24-hour cleanup sweep in cleanup.ts still applies; the OS also reclaims
// /tmp on its own schedule.
export const JOBS_ROOT = process.env.AUDIO_TOOLS_JOBS_DIR
  ? path.resolve(process.env.AUDIO_TOOLS_JOBS_DIR)
  : path.join(os.tmpdir(), "audio-tools-jobs");

export type JobState = "queued" | "running" | "done" | "error";

export type JobStatus = {
  id: string;
  state: JobState;
  pct: number;
  stage: string;
  filename: string;
  inputExt: string;
  settings: Settings;
  startedAt: string;
  finishedAt: string | null;
  error: { exitCode: number | null; stderrTail: string } | null;
  // pid of the spawned Python process group leader (null until spawn, or once cleared)
  pid: number | null;
  // ISO timestamp of the last Node-side activity (heartbeat or PROGRESS event).
  // The UI uses this to surface staleness independently of pct/stage changes.
  lastHeartbeatAt: string | null;
};

export function jobDir(id: string): string {
  return path.join(JOBS_ROOT, id);
}

export function outputDir(id: string): string {
  return path.join(jobDir(id), "output");
}

export function statusPath(id: string): string {
  return path.join(jobDir(id), "status.json");
}

export function stderrPath(id: string): string {
  return path.join(jobDir(id), "stderr.log");
}

export function zipPath(id: string): string {
  return path.join(jobDir(id), "output.zip");
}

export async function ensureJobsRoot(): Promise<void> {
  await fs.mkdir(JOBS_ROOT, { recursive: true });
}

export async function createJob(init: Omit<JobStatus, "state" | "pct" | "stage" | "startedAt" | "finishedAt" | "error" | "pid" | "lastHeartbeatAt">): Promise<JobStatus> {
  const status: JobStatus = {
    ...init,
    state: "queued",
    pct: 0,
    stage: "queued",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    pid: null,
    lastHeartbeatAt: new Date().toISOString(),
  };
  await fs.mkdir(jobDir(init.id), { recursive: true });
  await fs.mkdir(outputDir(init.id), { recursive: true });
  await writeStatus(status);
  return status;
}

export async function readStatus(id: string): Promise<JobStatus | null> {
  try {
    const raw = await fs.readFile(statusPath(id), "utf8");
    return JSON.parse(raw) as JobStatus;
  } catch (err: unknown) {
    if (isENoEnt(err)) return null;
    if (err instanceof SyntaxError) return null; // corrupted status.json — treat as missing
    throw err;
  }
}

export async function writeStatus(status: JobStatus): Promise<void> {
  // Per-call unique temp filename — multiple writers that overlapped on a
  // shared `.tmp` path previously produced corrupted status.json files
  // (a complete JSON followed by trailing fragments of another write).
  const tmp = `${statusPath(status.id)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(status, null, 2), "utf8");
  await fs.rename(tmp, statusPath(status.id));
}

// Per-job write chains: each updateStatus call queues behind the previous one
// for the same id so we never get a lost-update / read-modify-write race.
const writeChains = new Map<string, Promise<unknown>>();

export async function updateStatus(id: string, patch: Partial<JobStatus>): Promise<JobStatus | null> {
  const run = async (): Promise<JobStatus | null> => {
    const current = await readStatus(id);
    if (!current) return null;
    const next: JobStatus = { ...current, ...patch };
    await writeStatus(next);
    return next;
  };
  const prev = writeChains.get(id) ?? Promise.resolve();
  const chained = prev.catch(() => null).then(run);
  writeChains.set(id, chained);
  return chained;
}

export async function listJobs(): Promise<string[]> {
  try {
    return await fs.readdir(JOBS_ROOT);
  } catch (err: unknown) {
    if (isENoEnt(err)) return [];
    throw err;
  }
}

function isENoEnt(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "ENOENT";
}
