import { NextResponse } from "next/server";
import fs, { createReadStream } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { readStatus, outputDir } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream a file from the job's output directory back to the browser.
//
//   GET /api/jobs/<id>/file?name=<rel-path>
//
// `<rel-path>` is a path relative to the job's output dir (the format returned
// by the /metadata route's `files.*` fields). The handler:
//
//   • normalises and verifies the resolved path stays *inside* outputDir(id)
//     — paths with `..` segments or absolute paths are rejected. This is the
//     only thing standing between the public dev server and arbitrary local
//     file reads.
//
//   • supports HTTP Range requests so <audio> tags can seek through the
//     stabilised WAV / stems without downloading them in full first.
//
//   • sets `Content-Disposition: attachment` only when `?download=1` is set;
//     audio / PDF stream inline so the browser can preview them.

const MIME_BY_EXT: Record<string, string> = {
  ".wav":      "audio/wav",
  ".mp3":      "audio/mpeg",
  ".m4a":      "audio/mp4",
  ".flac":     "audio/flac",
  ".ogg":      "audio/ogg",
  ".pdf":      "application/pdf",
  ".json":     "application/json",
  ".musicxml": "application/vnd.recordare.musicxml+xml",
  ".xml":      "application/xml",
};

function mimeFor(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const status = await readStatus(params.id);
  if (!status) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const rel = url.searchParams.get("name");
  if (!rel) {
    return NextResponse.json({ error: "missing ?name" }, { status: 400 });
  }

  const root = path.resolve(outputDir(params.id));
  const resolved = path.resolve(root, rel);
  // Containment check — without this, ?name=../../../etc/passwd would read
  // anywhere the dev server has access to.
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = await fsp.stat(resolved);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 404 });
  }

  const total = stat.size;
  const mime = mimeFor(resolved);
  const download = url.searchParams.get("download") === "1";
  const filename = path.basename(resolved);

  const baseHeaders: Record<string, string> = {
    "Content-Type":   mime,
    "Accept-Ranges":  "bytes",
    "Cache-Control":  "private, max-age=0, must-revalidate",
  };
  if (download) {
    // Filename in Content-Disposition needs ASCII; fall back to a safe slug
    // when there are non-ASCII chars.
    const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "_");
    baseHeaders["Content-Disposition"] = `attachment; filename="${safe}"`;
  }

  // Range request: serve the slice the player asked for. <audio> in Chrome
  // / Safari always sends an initial Range: bytes=0- to probe streamability.
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const startStr = match[1];
      const endStr   = match[2];
      const start = startStr === "" ? 0 : parseInt(startStr, 10);
      const end   = endStr   === "" ? total - 1 : Math.min(parseInt(endStr, 10), total - 1);
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      const stream = createReadStream(resolved, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range":  `bytes ${start}-${end}/${total}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  const stream = createReadStream(resolved);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      ...baseHeaders,
      "Content-Length": String(total),
    },
  });
}
