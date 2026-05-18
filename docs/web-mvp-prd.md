# Audio-Tools Web MVP — PRD & Implementation Plan

> **Status:** Draft  
> **Owner:** Fernando Rocha  
> **Last updated:** 2026-05-16  
> **Target repo:** fork of `audio-tools`  
> **Reading order:** Sections 1–7 are the PRD. Section 8 onward is the engineering plan.

---

## 1. Background

`audio-tools` is a working CLI that turns a raw audio file into three artifacts:

1. **Beat-stabilised WAV** — every beat snapped to a perfect grid, trimmed for drop-in DAW use.
2. **Chord chart PDF** — neural-net chord detection (crema + madmom), rendered as a printable lead sheet via LilyPond.
3. **Stems** — up to 6 isolated tracks (vocals, drums, bass, guitar, piano, other) via Demucs.

Today it's only usable from the terminal:

```
python3 pipeline.py -i song.wav --title "My Song"
```

Setup is heavy (Homebrew installs, three Python virtual envs, model-weight downloads on first run). Non-technical users can't approach it. **This MVP wraps the existing pipeline in a 3-screen web UI that runs entirely on the user's local machine** — drop a file, watch a progress bar, download a ZIP.

## 2. Goals

- **Zero-friction usage** once setup is done: one command (`npm run dev`), one URL, three screens.
- **Reuse the existing Python pipeline verbatim.** No algorithmic changes; only additive progress instrumentation.
- **Hide complexity by default**, expose it for power users via a collapsible "Advanced Settings" panel.
- **Performance guardrails**: 50 MB upload limit, ~6 min duration cap, single concurrent job per server.
- **Resilience**: the in-flight job survives a browser tab close; closing the tab triggers a confirmation prompt.
- **Honest progress reporting** (percentage + stage label + elapsed time), not a fake spinner.
- **Clean error reporting** when something inside the pipeline fails.
- **Auto-cleanup** of job artifacts after 24h so the disk doesn't fill silently.

## 3. Non-Goals (MVP)

- No cloud deployment. The original "run on Vercel" target was dropped after a feasibility check (see §4).
- No authentication, accounts, billing, or "job history" view.
- No concurrent job processing — the second upload waits.
- No live audio preview, waveform rendering, or in-browser playback.
- No mobile-first design. Desktop browsers only.
- No public hosting or shareable URLs.

## 4. Why local-only (not Vercel)

The original brief specified Vercel. After exploration, that target is **not viable** for the worker:

| Constraint | Vercel limit | Pipeline reality |
|---|---|---|
| Max function duration | 300 s (Fluid) | A 3-min song commonly takes 2–10 min on CPU |
| Native binaries | None | Needs `ffmpeg`, `rubberband`, **LilyPond** |
| ML runtimes | None pre-installed | TensorFlow 2 (crema), PyTorch (Demucs), madmom |
| Persistent disk | None | Model weights ~80–320 MB, output WAVs ~50–200 MB |
| GPU | Not available | Demucs without GPU is the slowest stage |

Vercel **frontend** is possible later, with the worker running on Modal / Replicate / a dedicated box. The MVP runs both layers on `localhost` to ship fast. The architecture in §9 leaves a clean swap point at `lib/pipeline.ts` so the worker can move to a remote host without touching the UI.

## 5. Users & user stories

**Primary user:** a musician or producer who has cloned the repo and run `setup.sh` once.

| As a … | I want to … | so that … |
|---|---|---|
| Musician | drop an audio file into a web page | I don't have to remember CLI flags |
| Musician | see the file get rejected immediately if it's too big or the wrong format | I'm not stuck waiting on a doomed upload |
| Musician | see a real progress bar | I know whether to grab coffee or wait |
| Musician | be warned before accidentally closing the tab | I don't lose 5 minutes of work |
| Musician | download a single ZIP at the end | I get everything without hunting through folders |
| Power user | optionally override BPM, key, stem selection | I can tune analysis for tricky songs |
| Power user | read an error message when something blows up | I can fix it instead of guessing |

## 6. User flow & screens

```
┌───────────────────┐    submit    ┌──────────────────┐  done   ┌──────────────────┐
│ 1. Upload screen  │ ───────────▶ │ 2. Processing    │ ──────▶ │ 3. Success       │
│                   │              │                  │         │                  │
│ • drop area       │              │ • progress bar   │         │ • download ZIP   │
│ • file picker     │              │ • stage label    │         │ • total elapsed  │
│ • advanced panel  │              │ • elapsed timer  │         │ • "another file" │
│ • client-side     │              │ • beforeunload   │         │                  │
│   validation      │              │   warning        │         │                  │
└───────────────────┘              └──────────────────┘         └──────────────────┘
                                            │  error
                                            ▼
                                   ┌──────────────────┐
                                   │  Error state     │
                                   │ • stderr tail    │
                                   │ • "Try again"    │
                                   └──────────────────┘
```

### Screen 1 — Upload

- Large centered drop area + "Select file" button (react-dropzone).
- Accepts: `wav`, `mp3`, `m4a`, `aiff`, `flac`, `ogg`.
- Hard limits: **50 MB**, **6 min duration** (duration validated server-side via `ffprobe`).
- Below the drop area: collapsed **Advanced Settings** panel. When open it exposes the full `pipeline.py` flag set:
  - **Output:** Title, Open PDF when done
  - **Beat stabilizer:** BPM override, Strength (0–1), Trim intro, Beats per bar, Skip stabilization
  - **Chord chart:** Key, Time signature, Bars per line, Hide BPM/Key/Meter, Custom subtitle, Add 7ths, Madmom fallback, Madmom threshold, Key tiebreak, Key snap, Key-snap threshold, Mid-bar threshold, Half-time, Compound
  - **Stem splitter:** Stems to keep (checkboxes), Stem model (`htdemucs_6s` default), Skip stems
- Submit → POST `/api/jobs` → navigate to `/jobs/<id>`.

### Screen 2 — Processing

- Big progress bar with percentage number.
- Current-stage label: "Detecting beats…" / "Generating chord chart…" / "Splitting stems…".
- Elapsed timer ticking ("Elapsed: 2:34").
- Persistent banner: "Don't close this tab — processing will be lost if you do."
- `beforeunload` handler shows the browser's native confirmation dialog.
- Polls `GET /api/jobs/:id` every 1 s.

### Screen 3 — Success

- Filename and **total elapsed time** ("Finished in 4 min 12 s").
- Primary CTA: **Download ZIP** → `/api/jobs/:id/zip`.
- Secondary CTA: **Process another file** → back to `/`.

### Error state (inline replacement on screen 2)

- Heading: "Something went wrong."
- Monospace block: last ~20 lines of stderr.
- **Try again** → back to `/`.

## 7. Functional & non-functional requirements

### Functional

| ID | Requirement |
|---|---|
| F-1 | Drag-drop and click-to-select both upload the same file |
| F-2 | Client rejects files >50 MB or unsupported extension with inline error before upload |
| F-3 | Server re-validates size, extension, and duration ≤ 6 min after receiving the file |
| F-4 | Advanced settings, when opened, exposes every option supported by `pipeline.py` |
| F-5 | Processing screen shows precise %, stage label, and elapsed time, updating ≥ every 1 s |
| F-6 | Browser confirms before closing the processing tab |
| F-7 | Reopening `/jobs/<id>` in a new tab resumes the same view (state persists on disk) |
| F-8 | Success screen offers a single ZIP containing all artifacts the pipeline produced |
| F-9 | Errors show the last 20 lines of stderr and a retry path |
| F-10 | Server deletes job directories older than 24 h on each new upload |

### Non-functional

| ID | Requirement |
|---|---|
| N-1 | Single concurrent job; subsequent uploads queue and report `queued` |
| N-2 | Job state must survive a server restart (state is a file on disk) |
| N-3 | All artifacts live under `web/jobs/<uuid>/`; nothing leaks elsewhere |
| N-4 | Adding the web layer must not break the existing CLI behaviour |
| N-5 | Codebase stays in TypeScript on the frontend; no separate Python HTTP server |

## 8. Tech stack

- **Next.js 14** (App Router, TypeScript) — frontend + API routes share one process
- **Tailwind CSS** + a small subset of **shadcn/ui** (Button, Progress, Dialog, Disclosure)
- **react-dropzone** for upload
- **archiver** for ZIP packaging
- **zod** for input validation
- **uuid** for job IDs
- Existing **Python pipeline**, with additive `--progress-json` instrumentation
- **ffprobe** (already installed via Homebrew alongside ffmpeg) for duration check

## 9. Architecture

```
┌─────────────────────────────────────┐
│  Browser (localhost:3000)           │
│  ┌───────────┐ ┌──────────┐ ┌────┐  │
│  │ Upload    │→│ Process  │→│ZIP │  │
│  └───────────┘ └──────────┘ └────┘  │
└──────────┬──────────────────────────┘
           │ HTTP (fetch + polling)
           ▼
┌─────────────────────────────────────┐
│  Next.js 14 (App Router)            │
│  ┌─────────────────────────────┐    │
│  │ POST /api/jobs   (upload)   │    │
│  │ GET  /api/jobs/:id          │    │
│  │ GET  /api/jobs/:id/zip      │    │
│  └──────────┬──────────────────┘    │
│             │ child_process.spawn   │
│             ▼                       │
│  python3 pipeline.py --progress-json│
│   ├─ beat_stabilizer.py             │
│   ├─ venv_crema/…/chord_chart…      │
│   └─ venv_demucs/…/stem_splitter…   │
└─────────────────────────────────────┘
           │ writes
           ▼
   web/jobs/<uuid>/
     ├── input.<ext>
     ├── status.json    # {state, pct, stage, started_at, finished_at, error}
     ├── stderr.log
     ├── output/        # everything pipeline.py produces
     └── output.zip     # zipped on completion
```

**Swap point for future cloud deployment:** all subprocess work is encapsulated in `web/lib/pipeline.ts`. Replacing the `child_process.spawn` with an HTTP call to Modal/Replicate is a single-file change.

## 10. Backend instrumentation

The pipeline source needs **additive** progress reporting. No algorithmic changes. All hooks are no-ops unless `--progress-json` is passed.

### Global pct mapping (in `pipeline.py`)

| Stage | Range |
|---|---|
| Beat stabilization | 0 → 10 |
| Chord chart | 10 → 40 |
| Stem splitting | 40 → 100 |

If a stage is skipped, its range is redistributed across the remaining stages.

### Hook points

- **`pipeline.py`** — accept `--progress-json`; replace `subprocess.run(cmd)` with a `Popen` that reads each child's stdout line-by-line, parses `PROGRESS {...}` JSON, remaps the local `pct` into the global range, re-emits on its own stdout. Emit stage-boundary markers.
- **`beat_stabilizer.py`** — emit at `detect_beats` (0.20), `warp` (0.70), `trim` (0.95).
- **`chord_chart_render.py`** — emit at `crema_infer` (0.05), `beat_align` (0.45), `madmom_fallback` (0.70, conditional), `pdf_render` (0.90).
- **`stem_splitter.py`** — wire Demucs' built-in progress callback to emit at `pct = chunks_done / chunks_total`.

Every emission is `print(f"PROGRESS {json.dumps({...})}", flush=True)` on stdout.

## 11. API contract

| Method | Path | Request | Response |
|---|---|---|---|
| `POST` | `/api/jobs` | `multipart/form-data` with `file` and JSON `settings` | `201 {id}` |
| `GET`  | `/api/jobs/:id` | — | `200 {state, pct, stage, elapsed_ms, error?, settings, filename}` |
| `GET`  | `/api/jobs/:id/zip` | — | `200` ZIP stream (`404` until done) |

`state ∈ { queued, running, done, error }`.

## 12. Data model

`web/jobs/<id>/status.json`:

```jsonc
{
  "id": "1c0c…",
  "state": "running",
  "pct": 42,
  "stage": "chord",
  "started_at": "2026-05-16T14:00:00Z",
  "finished_at": null,
  "filename": "song.wav",
  "settings": { /* full flag set chosen in Advanced Settings */ },
  "error": null
}
```

On crash, `error` is set to `{ "exit_code": <n>, "stderr_tail": "<last 20 lines>" }`.

## 13. File structure (new + modified)

```
audio-tools/
├── docs/
│   └── web-mvp-prd.md           # this file
├── web/                         # NEW — Next.js app
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Upload screen
│   │   ├── jobs/[id]/page.tsx   # Processing + error screen
│   │   ├── jobs/[id]/done/page.tsx
│   │   └── api/
│   │       ├── jobs/route.ts
│   │       ├── jobs/[id]/route.ts
│   │       └── jobs/[id]/zip/route.ts
│   ├── lib/
│   │   ├── jobs.ts              # filesystem-based job store
│   │   ├── pipeline.ts          # spawn + stream stdout, parse PROGRESS
│   │   ├── zip.ts               # archiver wrapper
│   │   ├── cleanup.ts           # 24h sweep
│   │   └── validation.ts        # zod schemas + size/extension/duration
│   ├── components/
│   │   ├── DropZone.tsx
│   │   ├── AdvancedSettings.tsx
│   │   ├── ProgressView.tsx
│   │   └── ErrorView.tsx
│   └── jobs/                    # runtime — gitignored
├── pipeline.py                  # MODIFIED — streaming + global pct remap
├── beat_stabilizer.py           # MODIFIED — 3 progress hooks
├── chord_chart_render.py        # MODIFIED — 4 progress hooks
├── stem_splitter.py             # MODIFIED — Demucs callback
├── README.md                    # MODIFIED — add "Web UI (local)" section
└── .gitignore                   # MODIFIED — web/node_modules, web/.next, web/jobs
```

---

# Implementation Plan

Built in **5 sequential phases**. Each phase has a clear deliverable, a manual test, and a "Done when" gate. **Do not start a phase until the previous one's gate is green.**

## Phase 0 — Repo prep

**Goal:** create the fork, set up `docs/`, get the workspace ready.

### Tasks

1. Fork `audio-tools` to your account.
2. Clone the fork locally.
3. Confirm `bash setup.sh` still completes cleanly. (Sanity check — no behaviour change yet.)
4. Add `web/`, `web/node_modules/`, `web/.next/`, `web/jobs/` to `.gitignore`.
5. Commit this PRD into `docs/web-mvp-prd.md`.

### Done when

- `python3 pipeline.py -i some_test.wav` still works end-to-end.
- `docs/web-mvp-prd.md` is committed.

---

## Phase 1 — Backend progress instrumentation

**Goal:** make the Python pipeline emit precise progress events when `--progress-json` is passed. **No web layer yet.** This phase is verifiable purely from a terminal.

### Tasks

1. Add `--progress-json` flag to each of: `pipeline.py`, `beat_stabilizer.py`, `chord_chart_render.py`, `stem_splitter.py`.
2. Define an emission helper (one per file, or shared via a tiny `progress.py` if you like):

   ```python
   def emit(sub, pct, msg=None):
       if not args.progress_json: return
       print(f"PROGRESS {json.dumps({'sub': sub, 'pct': pct, 'msg': msg})}", flush=True)
   ```
3. Add hooks at the points listed in §10. Each sub-tool reports a local 0.0–1.0.
4. In `pipeline.py`, replace `subprocess.run(...)` with `Popen` that streams stdout, parses `PROGRESS` lines, remaps each `pct` into the global range (Stabilize 0–10, Chord 10–40, Stems 40–100), redistributes ranges if stages are skipped, and re-emits `PROGRESS {"stage": "...", "pct": <0-100>, "msg": ...}` on its own stdout.
5. Preserve **non-progress** stdout from children: pipe it through unchanged so debug output isn't swallowed.
6. Guarantee the existing CLI is byte-identical when `--progress-json` is **not** passed.

### How to test

```bash
# Without the flag: identical to old behaviour
python3 pipeline.py -i test.wav

# With the flag: a steady stream of PROGRESS lines, ending near 100
python3 pipeline.py -i test.wav --progress-json | grep PROGRESS
```

Eyeball the progression: it should be **monotonic** (never goes backwards), reach **≥99** at the end, and emit at least 10–15 events across a typical 3-minute song.

### Done when

- `--progress-json` produces a monotonic, well-distributed stream.
- Running without `--progress-json` yields output byte-identical to `master`.
- Output files in `~/Desktop/audio-tools-tests/<song>/` are unchanged from `master`.

### Commit

`feat(pipeline): emit progress JSON behind --progress-json flag`

---

## Phase 2 — Next.js skeleton + upload screen

**Goal:** scaffold the web app, ship Screen 1 (upload). No processing yet — uploads just save the file to disk and return a fake job ID.

### Tasks

1. `cd web && npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias="@/*"`.
2. Install: `react-dropzone`, `zod`, `uuid`, `archiver`, `@types/archiver`, `@types/uuid`.
3. (Optional but recommended) Initialize shadcn/ui and add `button`, `progress`, `dialog` components.
4. Build `app/page.tsx` (Screen 1): drop area + file picker + Advanced Settings panel with **every** flag from §6.
5. Build `app/api/jobs/route.ts` — `POST`:
   - Parse multipart with `request.formData()`.
   - Validate extension and size in `lib/validation.ts`.
   - Run `ffprobe` to validate duration ≤ 6 min (reject with 400 if exceeded).
   - Generate UUID, write file to `web/jobs/<id>/input.<ext>`, write initial `status.json` (state `queued`).
   - **Don't spawn the pipeline yet.** Return `201 {id}`.
6. Build `lib/jobs.ts` — `createJob`, `getJob`, `updateJob`, `listJobs` (filesystem-backed).

### How to test

- `npm run dev` in `web/`.
- Visit `http://localhost:3000`.
- Drag a valid `.wav` → upload succeeds, browser navigates to `/jobs/<id>` (which is a 404 stub for now). `web/jobs/<id>/input.wav` exists on disk. `status.json` shows `state: queued`.
- Drag a 60 MB file → client-side error, no upload.
- Drag `.txt` → client-side error.
- Open Advanced Settings, toggle a few flags, submit → `settings` in `status.json` reflects the choices.
- Upload a 10-minute audio file → server rejects with 400 and a clear message.

### Done when

- All test cases pass.
- No pipeline.py invocations yet.

### Commit

`feat(web): upload screen + job-creation API`

---

## Phase 3 — Pipeline spawn + processing screen

**Goal:** wire the pipeline to actually run, and ship Screen 2.

### Tasks

1. Build `lib/pipeline.ts`:
   - `runPipeline(jobId, inputPath, settings)`.
   - `spawn('python3', ['pipeline.py', '--progress-json', '--output-dir', outDir, '-i', inputPath, ...flags], { detached: true })`.
   - Reads child stdout line-by-line, parses `PROGRESS` lines, calls `updateJob(id, { pct, stage })`.
   - Appends all stdout/stderr to `stderr.log`.
   - On exit code 0: call `lib/zip.ts` to package `output/` into `output.zip`, mark `state: done`, set `finished_at`.
   - On non-zero exit: capture last 20 lines of `stderr.log` into `status.error`, mark `state: error`.
   - **Queue:** if another job is `running`, set new job to `queued` and don't spawn until current one finishes.
2. Update `POST /api/jobs` to call `runPipeline` after writing the input file.
3. Build `GET /api/jobs/:id` returning the full `status.json`.
4. Build `app/jobs/[id]/page.tsx` (Screen 2):
   - Polls `/api/jobs/:id` every 1 s.
   - Shows progress bar with `pct`, stage label derived from `stage`, elapsed timer.
   - Persistent "don't close this tab" banner.
   - `useEffect` registers `beforeunload` handler.
   - Switches into the inline error state if `state === "error"`.
   - On `state === "done"` → router.push to `/jobs/[id]/done`.
5. Build the **error state** component: heading + `<pre>` with `error.stderr_tail` + "Try again" button.

### How to test

- Upload a real `.wav` → arrive on Screen 2.
- Watch the progress bar climb smoothly through stabilize → chord → stems.
- Try to close the tab → browser confirmation appears.
- Force an error: rename `venv_demucs/` and run a job with stems enabled. After a few seconds, error screen appears with relevant stderr lines. Click "Try again" → back to upload.
- Open `/jobs/<id>` in two tabs simultaneously → both reflect the same progress.

### Done when

- Real job completes end-to-end with smooth progress.
- Window-close confirmation works.
- Error state displays informative stderr.

### Commit

`feat(web): processing screen + pipeline orchestration`

---

## Phase 4 — Success screen, ZIP download, cleanup

**Goal:** finish the happy path and harden the lifecycle.

### Tasks

1. Build `lib/zip.ts` using `archiver` — zips `web/jobs/<id>/output/` recursively into `web/jobs/<id>/output.zip`. Called at the end of `runPipeline` on success.
2. Build `GET /api/jobs/:id/zip` — streams the ZIP with `Content-Disposition: attachment; filename="<song>.zip"`. Returns 404 if not yet ready.
3. Build `app/jobs/[id]/done/page.tsx` (Screen 3):
   - Show filename and total elapsed time (`finished_at - started_at`).
   - "Download ZIP" button hitting `/api/jobs/:id/zip`.
   - "Process another file" → `/`.
4. Build `lib/cleanup.ts` — `sweepOldJobs()` walks `web/jobs/`, deletes any whose `started_at` is older than 24 h.
5. Call `sweepOldJobs()` at the start of every `POST /api/jobs` (fire-and-forget).
6. Update `README.md` with a "Web UI (local)" section: setup steps, `npm run dev`, link to this PRD.

### How to test

- Complete a job → Success screen shows the right filename and elapsed time.
- Click "Download ZIP" → ZIP downloads, contains: `*_stabilised.wav`, `*_chord_chart.pdf`, `*_chord_chart.json`, `*_stems/` (folder with WAVs).
- Open the PDF — matches the CLI output for the same input.
- `touch -d '26 hours ago' web/jobs/<old-id>/status.json`, then submit a new job → confirm the old directory is deleted.
- Submit two jobs in quick succession → first runs, second sits at `queued` until the first finishes.

### Done when

- Full happy path works on at least 3 different real songs (different lengths, genres, sample rates).
- ZIP contains exactly the same artifacts the CLI produces.
- 24 h cleanup works.
- Queue behaviour confirmed.

### Commit

`feat(web): success screen, ZIP download, 24h cleanup, README`

---

## Phase 5 — Polish & ship

**Goal:** make it feel solid before declaring MVP done.

### Tasks

1. **Loading & disabled states**: disable submit button during upload, disable Advanced toggle during a queued job.
2. **Filename sanitization**: the chord chart and stem outputs use the input filename — strip unsafe characters before passing to `pipeline.py`.
3. **Form persistence**: remember last-used Advanced Settings in `localStorage` so power users don't re-toggle every time.
4. **Empty state**: clear copy for "no advanced setting changed; defaults will apply."
5. **Visual polish**: pad sections, consistent typography, light/dark via Tailwind defaults.
6. **Manual QA pass** against the verification checklist below.

### Verification checklist (final)

- [ ] Drop area accepts wav/mp3/m4a/aiff/flac/ogg
- [ ] Files >50 MB rejected client-side
- [ ] Files >6 min rejected server-side
- [ ] Non-audio extensions rejected
- [ ] Advanced Settings exposes every `pipeline.py` flag
- [ ] Progress bar climbs smoothly; never goes backwards
- [ ] Stage label updates ("Detecting beats…", "Generating chord chart…", "Splitting stems…")
- [ ] Elapsed time ticks every second
- [ ] beforeunload prompt fires
- [ ] Reopening `/jobs/<id>` resumes the same view
- [ ] Pipeline crash → error screen with last 20 lines of stderr
- [ ] "Try again" returns to upload
- [ ] Success screen shows total elapsed time
- [ ] ZIP contains all expected artifacts
- [ ] 24 h cleanup removes old jobs
- [ ] Two simultaneous uploads queue correctly
- [ ] Existing CLI still works (`python3 pipeline.py -i x.wav` byte-identical to `master`)

### Commit

`chore(web): MVP polish and verification pass`

---

## 14. Open questions / future work

- **Cloud worker (Modal/Replicate)** — drop-in for `lib/pipeline.ts` when GPU is justified.
- **Per-stage timing breakdown on success screen** — interesting to surface.
- **Sharable result URLs** — needs auth and a real storage layer first.
- **WebSocket / SSE progress** — current 1 s polling is good enough; SSE is a nice-to-have if perceived smoothness matters.
- **Audio preview pre-upload** — could catch obvious mistakes (silent files, wrong song) before a 5-min pipeline run.
- **Concurrent jobs** — requires real queue (BullMQ/Redis) and per-job CPU pinning to avoid thrashing on a laptop.
- **Drag-drop multiple files** — current scope is one file at a time.

## 15. Glossary

| Term | Meaning |
|---|---|
| **Stabilization** | Snapping every detected beat onto a perfect grid via time-stretch |
| **Chord chart** | PDF lead sheet showing chord-per-bar (or finer) for the song |
| **Stem** | An isolated track (vocals, drums, bass, etc.) extracted from the full mix |
| **crema** | TensorFlow-based chord recognition neural net (primary model) |
| **madmom** | RNN/HMM-based audio analysis library (beat detection + chord fallback) |
| **Demucs** | Meta Research's PyTorch model for source separation (stems) |
| **LilyPond** | Open-source music notation engraver used to render the chord chart PDF |

---

## How to continue this work later

1. Open this file (`docs/web-mvp-prd.md`).
2. Find the most recent commit on the fork; the commit message tells you which Phase was last completed.
3. Re-read **just the next Phase section**. Each is self-contained.
4. Run the previous Phase's "Done when" tests to confirm nothing has regressed.
5. Implement, test, commit, repeat.

If anything in the PRD turns out wrong as you implement, edit the PRD in the same commit as the code change so the doc never drifts.
