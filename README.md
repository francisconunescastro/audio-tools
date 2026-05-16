# audio-tools

Three tools that work together:

1. **Beat Stabilizer** — warps audio so every beat locks to a perfect rhythmic grid (like Ableton's "Warp to grid"), then trims the output so it drops straight into a DAW at bar 1
2. **Chord Chart** — detects chords using two neural networks (crema + madmom), aligns them to the beat grid, and renders a PDF lead sheet
3. **Stem Splitter** — separates audio into up to 6 stems (vocals, drums, bass, guitar, piano, other) using Demucs

---

## Requirements

- macOS (Apple Silicon or Intel) or Linux
- Python 3.11 and Python 3.13+ (both needed — see why below)
- [Homebrew](https://brew.sh) (macOS)

---

## Web UI (local)

A browser-based wrapper lives under `web/`. Drop a file, watch progress, download a ZIP. Runs entirely on your machine — see [`docs/web-mvp-prd.md`](docs/web-mvp-prd.md) for design and roadmap.

```bash
bash setup.sh                # one-time: installs ffmpeg, rubberband, LilyPond, the three venvs
cd web && npm install        # one-time: web dependencies
npm run dev                  # then open http://localhost:3000
```

Limits: 50 MB upload, ~6 min audio, single concurrent job per server, artifacts auto-deleted after 24 h.

Job artifacts (the uploaded audio, intermediate files, output ZIPs) are written to
`$TMPDIR/audio-tools-jobs/` (e.g. `/var/folders/.../T/audio-tools-jobs` on macOS,
`/tmp/audio-tools-jobs` on Linux). Set `AUDIO_TOOLS_JOBS_DIR=/custom/path` to override.

---

## Setup

Run once after cloning or downloading:

```bash
bash setup.sh
```

This installs:
- `rubberband` and `ffmpeg` via Homebrew
- Beat stabilizer Python deps into the system Python
- A self-contained `venv_crema/` environment (Python 3.11 + crema + TensorFlow 2.x) for chord detection
- A self-contained `venv_madmom/` environment (Python 3.11 + madmom, NumPy 1.26.4) for beat detection and the optional chord fallback
- A self-contained `venv_demucs/` environment (Python 3.11 + PyTorch + Demucs) for stem splitting
- LilyPond for PDF rendering

> **Why separate virtual environments?**
> `crema` needs TensorFlow 2.x (incompatible with Python 3.13+), `madmom` requires NumPy 1.x, and Demucs needs PyTorch — they all conflict with each other and with the system Python. Each tool runs in its own isolated environment; `pipeline.py` wires them together automatically.

---

## Usage

### Full pipeline (recommended)

```bash
python3 pipeline.py -i song.wav
python3 pipeline.py -i song.wav --bpm 84 --title "My Song" --open
python3 pipeline.py -i song.wav --strength 0.8 --key "bes:major" --open
python3 pipeline.py -i song.wav --stems vocals,drums   # keep only two stems
python3 pipeline.py -i song.wav --skip-stems           # skip stem splitting
python3 pipeline.py -i song.wav --no-trim-intro        # skip DAW-ready trim
```

This runs all three steps in sequence. The BPM is passed between steps automatically via a `.bpm` sidecar file — no need to repeat it.

**Output files** (written to `~/Desktop/audio-tools-tests/<songname>/`):
- `song_stabilised.wav` — beat-locked audio, trimmed to start one bar before beat 1
- `song_stabilised.wav.bpm` — BPM sidecar (used internally)
- `song_chord_chart.pdf` — the chord chart
- `song_chord_chart.json` — analysis metadata
- `song_stems/` — folder containing one WAV per stem

### Beat stabilizer only

```bash
python3 beat_stabilizer.py -i song.wav -o song_stable.wav
python3 beat_stabilizer.py -i song.wav -o song_stable.wav --bpm 120
python3 beat_stabilizer.py -i song.wav -o song_stable.wav --bpm 98 --strength 0.8
python3 beat_stabilizer.py -i song.wav --detect-only   # just print BPM, don't write
python3 beat_stabilizer.py -i song.wav -o out.wav --no-trim-intro
```

| Flag | Description |
|------|-------------|
| `--bpm` | Target BPM. Auto-detected and rounded if omitted. |
| `--strength` | `1.0` = fully locked to grid, `0.0` = unchanged (default: `1.0`) |
| `--detect-only` | Print detected BPM and exit without writing any file |
| `--no-trim-intro` | Disable the default intro trim (see below) |
| `--beats-per-bar` | Bar length used for the intro trim (default: `4`) |

#### Intro trim (on by default)

After stabilisation, the output is trimmed so it starts **exactly one bar before the first detected beat**. This means you can drop the file into a DAW, set the project tempo, place the clip at bar 1 beat 1, and everything lines up immediately — no manual offsetting needed.

If the first beat is less than one bar from the start of the file, silence is prepended to make room. Disable with `--no-trim-intro`.

#### Half-time auto-detection

When `--bpm` is supplied, the stabilizer compares the detected beat count against the expected count (`target_bpm / 60 × duration`). If the ratio is ≈ 2, it means the beat tracker locked onto 8th notes instead of quarter notes (common in half-time grooves). In that case:

- All detected 8th-note beats are kept as warp anchors (**2× correction density** vs thinning to every other beat)
- They are mapped to the 8th-note grid at `target_bpm`, so the output audio plays at the correct quarter-note tempo without stretching the file to double length

This is automatic — just pass the correct quarter-note BPM with `--bpm`.

#### Beat detection

The stabilizer uses **madmom's RNN + DBN beat tracker** (via `venv_madmom`) when available. This is significantly more accurate than librosa, especially for half-time grooves and songs with expressive timing. librosa is the fallback when `venv_madmom` is not found.

Benchmark on a half-time groove (78 BPM):

| Detector | Anchors | CV | Mean error | p90 error | Max error |
|----------|---------|-----|-----------|-----------|-----------|
| Before stabilisation | — | 3.83% | 16.1 ms | 31.9 ms | 142 ms |
| librosa (quarter notes) | 259 | 1.89% | 9.5 ms | 20.2 ms | 78 ms |
| librosa (8th-note density) | 517 | 2.04% | 9.4 ms | 14.6 ms | 90 ms |
| **madmom (8th-note density)** | **528** | **0.92%** | **4.7 ms** | **10.8 ms** | **31 ms** |

### Chord chart only

```bash
./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav
./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --title "My Song" --open
./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --key "f:minor" --bpm 84

# Enable the madmom fallback + key snapping for better accuracy on tricky songs:
./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --madmom-fallback --key-snap --open
```

**Basic flags**

| Flag | Description |
|------|-------------|
| `--title` | Chart title (default: filename) |
| `--bpm` | Override BPM. Auto-read from `.bpm` sidecar if present, otherwise detected. |
| `--key` | Key signature e.g. `f:minor`, `bes:major` (default: auto-detected) |
| `--time-sig` | Beats per bar e.g. `3`, `4` (default: auto-detected) |
| `--bars-per-line` | How many bars per system (default: `4`) |
| `--no-bpm` | Hide BPM from subtitle |
| `--no-key` | Hide key from subtitle |
| `--no-meter` | Hide meter from subtitle |
| `--subtitle` | Override the entire subtitle line (use `""` to hide it) |
| `--open` | Open the PDF when done |

**Two-model chord detection (optional)**

Chord detection uses [crema](https://github.com/bmcfee/crema) as the primary model.
For bars where crema's confidence is low you can enable a secondary pass with [madmom](https://github.com/CPJKU/madmom)'s bidirectional RNN + CRF recogniser.

| Flag | Default | Description |
|------|---------|-------------|
| `--no-madmom-fallback` | — | Disable the madmom fallback (it is **on by default**). |
| `--madmom-threshold` | `0.70` | Bars whose mean crema confidence falls below this are passed to madmom. |
| `--key-snap` | off | After all chord detection, snap any remaining non-diatonic chord in a low-confidence bar to the nearest diatonic equivalent. Useful when the model picks an out-of-key chord that is close in pitch space to the correct one. |
| `--key-snap-threshold` | `0.65` | Only bars below this mean confidence are eligible for key snapping. |
| `--add-7th` | off | Keep maj7, m7, and dominant 7 qualities; otherwise all chords are simplified to plain major or minor. |
| `--mid-bar-threshold` | `0.80` | Minimum crema confidence for a within-bar chord change to appear. Below this the bar keeps its beat-1 chord. |
| `--half-time` | off | Force every-other-beat selection (fixes half-time grooves where the tracker locks onto 8th notes). Auto-triggered when `--bpm` is ≈ half the detected rate. |
| `--compound` | off | Force 6/8 notation when beats-per-bar is 3 (most 6/8 songs are auto-detected). |

**Enharmonic spelling**

Chord roots are spelled to match the detected key: sharp keys (G, D, A, E, B, F#) use C#/F#/G# etc.; flat keys (F, B♭, E♭, A♭) use D♭/G♭/A♭ etc. The same spelling is applied consistently in both the PDF and terminal output.

### Skip stabilization

If you already have a stable file and just want the chord chart:

```bash
python3 pipeline.py -i stable_song.wav --skip-stabilize --open
```

### Stem splitter only

```bash
./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav
./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav --stems vocals,drums
./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav --model htdemucs
```

| Flag | Description |
|------|-------------|
| `--stems` | Comma-separated stems to keep e.g. `vocals,drums` (default: all) |
| `--model` | Demucs model: `htdemucs_6s` (default, 6 stems), `htdemucs` (4 stems, faster), `htdemucs_ft` (fine-tuned), `mdx_extra` |
| `--output-dir` | Output folder (default: `<input>_stems/`) |

> **Note:** On first run, Demucs downloads model weights (~80–320 MB). Subsequent runs use the cached weights.

Available stems per model:
- `htdemucs_6s` — vocals, drums, bass, guitar, piano, other
- All other models — vocals, drums, bass, other

---

## Supported input formats

`wav`, `mp3`, `m4a`, `aiff`, `flac`, `ogg`

Output is always WAV (lossless) for stabilised audio and PDF for the chart.

---

## Chord detection

### Primary model — crema

[crema](https://github.com/bmcfee/crema) is a neural network trained on 602 chord classes including major, minor, dominant 7th, major 7th, minor 7th, half-diminished, diminished 7th, augmented, sus2/4, and more. It produces frame-level predictions that are beat-synced and collapsed to bar-level chords.

### Secondary model — madmom (optional)

[madmom](https://github.com/CPJKU/madmom)'s `DeepChromaChordRecognitionProcessor` uses a bidirectional RNN that sees context before *and* after each frame. It tends to be more reliable than crema on harmonically close chords (e.g. A vs Bm in the same key). Enable it with `--madmom-fallback`.

madmom is also used for **beat detection** in the stabilizer (see above).

### Key snapping (optional)

When both models are uncertain, out-of-key chords can slip through. `--key-snap` examines every low-confidence bar: if its chord is not diatonic to the detected (or manually specified) key, it is replaced with the nearest diatonic chord by semitone root distance.

The diatonic set includes both natural minor and harmonic minor chords (the major V chord — e.g. E major in A minor — is always considered diatonic).

### Confidence thresholds

| Constant | Default | File | What it controls |
|----------|---------|------|-----------------|
| `CONFIDENCE_WARN` | `0.45` | `chord_sheet.py` | Segments flagged `?` in terminal; warning added to PDF if > 30% |
| `MID_BAR_THRESHOLD` | `0.80` | `chord_chart_render.py` | Minimum confidence for a within-bar chord split to appear |
| `MADMOM_THRESHOLD` | `0.70` | `chord_chart_render.py` | Bar mean confidence below which madmom re-evaluates |
| `KEY_SNAP_THRESHOLD` | `0.65` | `chord_chart_render.py` | Bar mean confidence below which key snapping applies |

All four can be overridden per-run via the matching CLI flag.

---

## File structure

```
audio-tools/
├── pipeline.py              # Full pipeline runner (all 3 steps)
├── beat_stabilizer.py       # Beat detection & time-warping
├── chord_sheet.py           # Chord detection & beat alignment (library)
├── chord_chart_render.py    # PDF chart generator (crema primary + madmom fallback + key snap)
├── madmom_chord_detect.py   # Standalone madmom chord chart generator
├── stem_splitter.py         # Stem separation via Demucs
├── requirements.txt         # System Python deps (beat stabilizer)
├── requirements_crema.txt   # crema venv deps (chord tools)
├── requirements_madmom.txt  # madmom venv deps (beat detection + secondary chord detector)
├── requirements_demucs.txt  # demucs venv deps (stem splitter)
├── setup.sh                 # One-time setup script
├── venv_crema/              # Auto-created by setup.sh — do not commit
├── venv_madmom/             # Auto-created by setup.sh — do not commit
└── venv_demucs/             # Auto-created by setup.sh — do not commit
```
