import { NextResponse } from "next/server";
import { readStatus } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const status = await readStatus(params.id);
  if (!status) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const startedMs = Date.parse(status.startedAt);
  const finishedMs = status.finishedAt ? Date.parse(status.finishedAt) : Date.now();
  const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, finishedMs - startedMs) : 0;

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
    error: status.error,
  });
}
