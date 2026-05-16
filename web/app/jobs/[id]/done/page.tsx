"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Status = {
  id: string;
  state: "queued" | "running" | "done" | "error";
  pct: number;
  filename: string;
  elapsedMs: number;
  startedAt: string;
  finishedAt: string | null;
};

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s} s`;
  return `${m} min ${s.toString().padStart(2, "0")} s`;
}

export default function DonePage({ params }: { params: { id: string } }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/jobs/${params.id}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) setStatus(await res.json());
    })();
  }, [params.id]);

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Job not found</h1>
          <p className="text-sm text-neutral-500 mb-4">It may have been cleaned up after 24 hours.</p>
          <Link href="/" className="text-blue-600 hover:underline">Back to upload</Link>
        </div>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6 text-center">
        <div className="space-y-2">
          <div className="text-4xl">✓</div>
          <h1 className="text-2xl font-semibold">Processing complete</h1>
          <p className="text-sm text-neutral-500 font-mono break-all">{status.filename}</p>
        </div>

        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5 text-left text-sm space-y-2">
          <Row label="Total time" value={formatDuration(status.elapsedMs)} />
          {status.finishedAt && (
            <Row label="Finished" value={new Date(status.finishedAt).toLocaleString()} />
          )}
        </div>

        <a
          href={`/api/jobs/${params.id}/zip`}
          className="inline-block w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3"
        >
          Download ZIP
        </a>

        <p className="text-xs text-neutral-500">
          Contents: stabilized WAV · chord chart PDF · analysis JSON · stems folder
        </p>

        <Link
          href="/"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400"
        >
          Process another file →
        </Link>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-500">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
