# Audio-Tools Desktop App — PRD & Implementation Plan

> **Status:** Draft (planning only — no code changes yet)
> **Owner:** Fernando Rocha
> **Last updated:** 2026-05-16
> **Target:** macOS first, Windows/Linux later
> **Companion to:** [`web-mvp-prd.md`](web-mvp-prd.md)

---

## 1. Why we need this

The web MVP at `/web/` works end-to-end but only after a 10-minute setup that requires Homebrew, Python 3.11, three pip installs with native compilation (madmom Cython), Node, and `npm install`. Non-technical testers can't do that.

We want a **double-click installer** so anyone can try the pipeline on real music without touching a terminal. This is for *testing and demo only* — the eventual production target stays "web app with a remote backend," not "desktop app for end users."

**Key constraint:** the web codebase under `/web/` must keep working unchanged. The desktop app is a *wrapper* that hosts the same Next.js app inside an Electron shell with bundled Python, not a rewrite. When we later swap the local Python worker for a managed cloud service, the same Electron shell can host that version.

---

## 2. Design constraints (locked)

| Topic | Choice |
|---|---|
| Form factor | Standalone installer (.dmg on macOS first) |
| User installs | Zero — Python, ffmpeg, rubberband, lilypond, ML models all bundled |
| First-run time | < 30 s from double-click to upload screen |
| Bundle size | Target ≤ 2 GB compressed installer; we will likely land around 1.5 GB |
| Internet required | No (after install). All inference is local |
| Web code reuse | `/web/` is built unchanged and embedded; same routes, same UI |
| Platforms (phase 1) | macOS Apple Silicon only |
| Auto-update | Out of scope for phase 1; manual re-install for testers |

---

## 3. Architecture

```
┌──────────────────────────────────────────────┐
│  Audio Tools.app                             │
│  ┌────────────────────────────────────────┐  │
│  │  Electron main (Node)                  │  │
│  │   1. Resolve resource paths            │  │
│  │   2. Spawn Next.js prod server on a    │  │
│  │      random localhost port             │  │
│  │   3. Set AUDIO_TOOLS_PYTHON +          │  │
│  │      AUDIO_TOOLS_JOBS_DIR env vars     │  │
│  │   4. Add bundled bin/ to PATH          │  │
│  │   5. Open BrowserWindow → localhost    │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  BrowserWindow (Chromium)              │  │
│  │   Loads http://127.0.0.1:<port>        │  │
│  │   (the existing /web/ Next.js UI)      │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  Bundled resources                     │  │
│  │   resources/                           │  │
│  │     web/.next/standalone/  ← Next.js   │  │
│  │     python/                ← runtime   │  │
│  │     venv_madmom/                       │  │
│  │     venv_crema/                        │  │
│  │     venv_demucs/                       │  │
│  │     pipeline.py + scripts              │  │
│  │     bin/                               │  │
│  │       ffmpeg, rubberband, lilypond     │  │
│  │     models/                            │  │
│  │       htdemucs_6s/                     │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
                     ↓
       Job artifacts → ~/Library/Caches/
                       audio-tools/jobs/
```

No IPC custom-protocol, no preload bridge — the renderer just talks to its own embedded HTTP server. This keeps the desktop wrapper genuinely thin.

---

## 4. Critical decisions

### 4.1 Electron, not Tauri
Tauri would shave ~140 MB by using the system WebView, but the dominant cost is the Python venvs + ML models (~1.2 GB), so Electron's larger runtime is a small relative tax. We're a JS/TS team; Electron stays in the same language.

### 4.2 Python via `python-build-standalone`
[indygreg/python-build-standalone](https://github.com/indygreg/python-build-standalone) ships relocatable Python 3.11 distributions per platform/arch. We bundle that, then `pip install` our three requirements files into venvs **inside the resources directory at CI time**. The venvs are platform-specific so a separate CI run produces each platform's installer.

Alternatives considered and rejected:
- **System Python**: defeats the "zero install" goal.
- **PyOxidizer / Nuitka**: madmom's Cython extensions don't compile cleanly with these.
- **Pyinstaller**: per-script binaries balloon the bundle (each one duplicates numpy/torch).

### 4.3 Next.js standalone build, not dev server
We run `next build` in standalone mode (`output: "standalone"` in `next.config.mjs`) which emits a self-contained `server.js` plus a trimmed `node_modules`. Electron spawns this. Removes the need to ship the full `node_modules` tree.

### 4.4 Resource path resolution
In packaged mode `process.resourcesPath` points at `Contents/Resources` (macOS) / `resources/` (Windows). All bundled paths derive from this. Two env vars steer the existing web code at runtime, no `/web/` changes needed:

- `AUDIO_TOOLS_PYTHON` → `<resources>/python/bin/python3` (already supported by [pipeline.ts](../web/lib/pipeline.ts:54))
- `AUDIO_TOOLS_JOBS_DIR` → `~/Library/Caches/audio-tools/jobs` (already supported by [jobs.ts](../web/lib/jobs.ts:11))

The pipeline subprocess inherits a `PATH` prefixed with `<resources>/bin/` so bare `ffmpeg`, `rubberband`, `lilypond` calls resolve to the bundled binaries.

### 4.5 No code signing
We ship the `.dmg` unsigned. First-time testers will right-click → Open to bypass Gatekeeper once; thereafter it opens normally. Include a one-line note in the download instructions so they're not surprised.

### 4.6 ML model handling
The Demucs `htdemucs_6s` weights (~250 MB) ship inside the app. Demucs's default cache path is `~/.cache/torch/hub/`; we pre-seed it on first launch by symlinking or copying from `<resources>/models/`. crema's checkpoint (~30 MB) ships inside its venv's site-packages, no extra work.

---

## 5. Phased implementation steps

Each phase is shippable to the user as an installer they can test. Stop after any phase if the next one isn't worth the time.

### Phase 1 — Local prototype on the dev machine (1–2 days)
**Goal:** prove the bundled venvs + Next.js standalone actually run end-to-end without any system installs.

1. Add `/desktop/` directory with Electron Forge scaffold (`npm init electron-app`).
2. Configure `web/next.config.mjs` to add `output: "standalone"`. Verify `next build` produces `web/.next/standalone/server.js` and that running it on its own still works.
3. Write a script `desktop/scripts/build-venvs.sh` that:
   - Downloads `python-build-standalone` for the host arch into `desktop/runtime/python/`.
   - Creates the three venvs in `desktop/runtime/venv_*/` using that Python.
   - Installs from the existing `requirements_*.txt` files.
4. Write `desktop/scripts/bundle-binaries.sh` that copies the host's `ffmpeg`, `rubberband`, `lilypond` binaries (and their dynamic libs) into `desktop/runtime/bin/`. Smoke-test with `otool -L` that no `/opt/homebrew` paths leak.
5. Implement `desktop/src/main.ts`:
   - On `app.ready`: pick a free port, set env vars, spawn Next.js standalone server, wait for `/api/jobs` to respond, create `BrowserWindow` pointed at it.
   - On `before-quit`: kill the Next.js child + any running pipeline jobs (uses the new `cancelJob` API we already built).
6. `npm run start` — opens an Electron window, drop a song, full pipeline runs against the bundled Python.

**Exit criteria:** a song goes upload → progress → ZIP download with no system Python, no system Homebrew, just `npm run start` from `/desktop/`.

### Phase 2 — Packaged .dmg for macOS arm64 (1 day)
**Goal:** a friend on Apple Silicon can install this from a single download.

7. Configure Electron Forge `forge.config.ts` to bundle `desktop/runtime/` as `extraResource`.
8. Run `npm run make` — produces `out/make/Audio Tools-darwin-arm64.dmg`.
9. Write a short `INSTALL.md` for testers: drag to Applications, right-click the app the first time and choose Open to clear Gatekeeper.
10. Hand the .dmg to a non-developer on an M-series Mac, walk through the install once, then run a 3-min song through and confirm download works.

**Exit criteria:** 1 successful end-to-end run on a Mac that has never touched this repo.

### Phase 3 — Mac universal binary (1 day, optional)
**Goal:** support Intel Macs too.

11. Run `build-venvs.sh` twice — once on an x86_64 runner, once on arm64. Stash the two output trees.
12. Use Electron Forge `electronUniversal` to merge the two builds into a universal .dmg. The Python venvs and native binaries are arch-specific so they live in separate paths; main process picks at runtime via `process.arch`.

**Skip if** all testers are on Apple Silicon.

### Phase 4 — Windows installer (2–3 days)
**Goal:** Windows testers can try it.

13. Adapt `build-venvs.sh` to PowerShell + Windows wheels. Demucs (PyTorch CPU) and TensorFlow have Windows wheels; madmom needs MSVC to compile Cython — pin to a pre-built wheel if one exists, otherwise CI builds it.
14. Add Squirrel.Windows or NSIS installer config.
15. Ship unsigned; tell testers to click through the SmartScreen "More info → Run anyway" prompt on first launch.

### Phase 5 — Auto-update & telemetry (optional, after real demand)
Out of scope for the initial test push. If we keep iterating, add `update-electron-app` (uses GitHub releases as the update server) and a minimal opt-in error reporter.

---

## 6. File structure (additions only)

```
audio-tools/
├── web/                    # unchanged
├── desktop/                # new
│   ├── package.json
│   ├── forge.config.ts
│   ├── src/
│   │   ├── main.ts         # Electron main process
│   │   ├── server.ts       # spawn + health-check Next.js
│   │   └── preload.ts      # (probably empty — no IPC needed)
│   ├── scripts/
│   │   ├── build-venvs.sh
│   │   ├── bundle-binaries.sh
│   │   └── prebuild-next.sh
│   ├── runtime/            # gitignored; populated by scripts
│   │   ├── python/
│   │   ├── venv_crema/
│   │   ├── venv_madmom/
│   │   ├── venv_demucs/
│   │   ├── bin/
│   │   └── models/
│   └── assets/
│       ├── icon.icns
│       └── icon.ico
├── docs/
│   ├── web-mvp-prd.md
│   └── desktop-mvp-prd.md  # this file
└── .github/workflows/
    └── desktop-release.yml # CI matrix (phase 2+)
```

---

## 7. Build pipeline (phase 2+)

Per-platform GitHub Actions job (matrix: `macos-14`, `macos-13` for x86_64, later `windows-2022`, `ubuntu-22.04`):

1. Checkout
2. Set up Python 3.11 and Node 20
3. Run `desktop/scripts/build-venvs.sh` and `bundle-binaries.sh`
4. Run `web/` build (`next build`)
5. Run `desktop/` build (`electron-forge make`)
6. Notarize (macOS only, requires secrets)
7. Upload the installer as a release asset

Build time estimate: 15–25 minutes per platform. Cache the venvs + python-build-standalone tarballs aggressively (they don't change often).

---

## 8. Risks & open questions

| Risk | Mitigation |
|---|---|
| Lilypond bundle is huge (~150 MB) and pulls a separate Python | Strip locales, examples, docs from the lilypond tree; we only need PDF rendering. Could halve it. |
| madmom Cython extensions fail to compile in CI | Pin to a known-good combo of numpy<2 + Cython, cache wheels. Worst case: pre-build wheels once locally and check them into a private wheel-house. |
| Demucs first-run downloads models to `~/.cache/` | Pre-seed `~/.cache/torch/hub/` on first launch by copying from `<resources>/models/`. |
| The Next.js server binds to a port a tester already uses | Spawn with port `0` (OS-assigned) then read back the actual port from server output before opening the BrowserWindow. |
| Stale Python venv when user re-installs over an older app | On first launch, hash the bundled venvs and a `~/Library/Application Support/audio-tools/version` marker; rebuild caches if mismatched. |
| Unsigned `.dmg` triggers Gatekeeper on first launch | One-time right-click → Open per tester. Document in `INSTALL.md` shipped with the download. |

**Open questions for Fernando:**

1. Phase 3 (Intel Mac support) — is anyone in the test cohort on an Intel Mac, or can we skip?
2. Phase 4 (Windows) — same question; have any Windows testers in mind?
3. Are we comfortable with a ~1.5 GB download? Or worth investigating a "stub installer + download deps on first run" approach (smaller initial download, internet required first launch)?

---

## 9. What we explicitly are NOT building (for now)

- Native menus, keyboard shortcuts, drag-from-Finder integration (the web UI's drop zone works)
- Multi-job parallelism (still single-slot, same as web MVP)
- Cloud worker integration (Modal/Replicate) — that comes when we move the production target to a real backend; the desktop app remains for local testing only
- Auto-update (phase 5)
- Crash reporting / telemetry
- Localization

---

## 10. Definition of "done" for the initial test push

Phase 1 + Phase 2 only:
- A single `.dmg` file under 2 GB
- Drag-to-Applications install
- Double-click opens; no terminal, no Python install, no Homebrew
- Drop a 3-min wav → ZIP downloads, contents match the CLI output
- Tested on at least one Apple Silicon Mac that has never had this repo cloned

When that lands, we hand the .dmg to 3–5 non-technical friends and watch what happens.
