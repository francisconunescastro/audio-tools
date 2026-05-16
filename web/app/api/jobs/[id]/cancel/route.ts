import { NextResponse } from "next/server";
import { cancelJob } from "@/lib/pipeline";
import { readStatus } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const status = await readStatus(params.id);
  if (!status) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const cancelled = await cancelJob(params.id);
  return NextResponse.json({ cancelled });
}
