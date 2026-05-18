import fs from "node:fs/promises";
import { JOBS_ROOT, jobDir, readStatus, listJobs } from "./jobs";

const TTL_MS = 24 * 60 * 60 * 1000;

export async function sweepOldJobs(now: number = Date.now()): Promise<string[]> {
  const removed: string[] = [];
  const ids = await listJobs();
  for (const id of ids) {
    const status = await readStatus(id);
    if (!status) continue;
    const startedMs = Date.parse(status.startedAt);
    if (!Number.isFinite(startedMs)) continue;
    if (now - startedMs > TTL_MS) {
      await fs.rm(jobDir(id), { recursive: true, force: true });
      removed.push(id);
    }
  }
  // Touch the root so the directory always exists.
  await fs.mkdir(JOBS_ROOT, { recursive: true });
  return removed;
}
