import { NextResponse } from "next/server";
import { readStatus, updateStatus } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProcessAlive(pid: number | null | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let status = await readStatus(params.id);
  if (!status) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Defense in depth: if status claims "running" with a tracked OS pid that's
  // now dead, the server lost track of it (crash, hot-reload, manual kill) —
  // auto-flip to error so the UI stops polling a ghost. A null pid means the
  // child has already exited cleanly and the job is in post-processing
  // (zipping); leave it alone so we don't false-positive between exit and the
  // final "done" write.
  if (status.state === "running" && status.pid !== null && !isProcessAlive(status.pid)) {
    const patched = await updateStatus(params.id, {
      state: "error",
      error: { exitCode: null, stderrTail: "Process died unexpectedly. Try again." },
      finishedAt: new Date().toISOString(),
      pid: null,
    });
    if (patched) status = patched;
  }

  const startedMs = Date.parse(status.startedAt);
  const finishedMs = status.finishedAt ? Date.parse(status.finishedAt) : Date.now();
  const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, finishedMs - startedMs) : 0;

  const heartbeatMs = status.lastHeartbeatAt ? Date.parse(status.lastHeartbeatAt) : Date.parse(status.startedAt);
  const lastUpdateMs = Number.isFinite(heartbeatMs) ? Math.max(0, Date.now() - heartbeatMs) : 0;

  return NextResponse.json({
    id: status.id,
    state: status.state,
    pct: status.pct,
    stage: status.stage,
    filename: status.filename,
    settings: status.settings,
    startedAt: status.startedAt,
    finishedAt: status.finishedAt,
    elapsedMs,
    lastUpdateMs,
    error: status.error,
  });
}
