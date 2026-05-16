import fs from "node:fs/promises";
import path from "node:path";
import type { Settings } from "./validation";

export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const JOBS_ROOT = path.resolve(process.cwd(), "jobs");

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

export async function createJob(init: Omit<JobStatus, "state" | "pct" | "stage" | "startedAt" | "finishedAt" | "error">): Promise<JobStatus> {
  const status: JobStatus = {
    ...init,
    state: "queued",
    pct: 0,
    stage: "queued",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
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
    throw err;
  }
}

export async function writeStatus(status: JobStatus): Promise<void> {
  const tmp = statusPath(status.id) + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(status, null, 2), "utf8");
  await fs.rename(tmp, statusPath(status.id));
}

export async function updateStatus(id: string, patch: Partial<JobStatus>): Promise<JobStatus | null> {
  const current = await readStatus(id);
  if (!current) return null;
  const next: JobStatus = { ...current, ...patch };
  await writeStatus(next);
  return next;
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
