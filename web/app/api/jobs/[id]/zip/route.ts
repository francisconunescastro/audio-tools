import { NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { readStatus, zipPath } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const status = await readStatus(params.id);
  if (!status) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (status.state !== "done") {
    return NextResponse.json({ error: `Job is ${status.state}, not done.` }, { status: 409 });
  }
  const zip = zipPath(params.id);
  try {
    await fsp.access(zip);
  } catch {
    return NextResponse.json({ error: "ZIP not found" }, { status: 404 });
  }
  const stat = await fsp.stat(zip);
  const baseName = path.basename(status.filename, status.inputExt) || "audio-tools";
  const downloadName = `${baseName}.zip`;

  // Stream the file
  const stream = fs.createReadStream(zip);
  // @ts-expect-error — Node Readable is acceptable here at runtime
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${downloadName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
