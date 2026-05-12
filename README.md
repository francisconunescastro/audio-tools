# audio-tools

Two tools that work together:

1. **Beat Stabilizer** — warps audio so every beat locks to a perfect rhythmic grid (like Ableton's "Warp to grid")
2. **Chord Chart** — detects chords using a neural network, aligns them to the beat grid, and renders a PDF lead sheet

---

## Requirements

- macOS (Apple Silicon or Intel) or Linux
- Python 3.11 and Python 3.13+ (both needed — see why below)
- [Homebrew](https://brew.sh) (macOS)

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
- LilyPond for PDF rendering

> **Why two Python versions?**
> The chord detector uses `crema`, which depends on TensorFlow 2.x and an older scikit-learn — incompatible with Python 3.13+. The beat stabilizer works fine on the system Python. The `pipeline.py` script wires them together automatically.

---

## Usage

### Full pipeline (recommended)

```bash
python3 pipeline.py -i song.wav
python3 pipeline.py -i song.wav --bpm 84 --title "My Song" --open
python3 pipeline.py -i song.wav --strength 0.8 --key "bes:major" --open
```

This runs both steps in sequence. The BPM is passed between steps automatically via a `.bpm` sidecar file — no need to repeat it.

**Output files** (written next to the input):
- `song_stabilised.wav` — beat-locked audio
- `song_stabilised.wav.bpm` — BPM sidecar (used internally)
- `song_chord_chart.pdf` — the chord chart

### Beat stabilizer only

```bash
python3 beat_stabilizer.py -i song.wav -o song_stable.wav
python3 beat_stabilizer.py -i song.wav -o song_stable.wav --bpm 120
python3 beat_stabilizer.py -i song.wav -o song_stable.wav --bpm 98 --strength 0.8
python3 beat_stabilizer.py -i song.wav --detect-only   # just print BPM, don't write
```

| Flag | Description |
|------|-------------|
| `--bpm` | Target BPM. Auto-detected and rounded if omitted. |
| `--strength` | `1.0` = fully locked to grid, `0.0` = unchanged (default: `1.0`) |
| `--detect-only` | Print detected BPM and exit without writing any file |

### Chord chart only

```bash
./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav
./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --title "My Song" --open
./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --key "f:minor" --bpm 84
```

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

### Skip stabilization

If you already have a stable file and just want the chord chart:

```bash
python3 pipeline.py -i stable_song.wav --skip-stabilize --open
```

---

## Supported input formats

`wav`, `mp3`, `m4a`, `aiff`, `flac`, `ogg`

Output is always a WAV (lossless) for the stabilized audio and a PDF for the chart.

---

## Chord vocabulary

Chord detection uses [crema](https://github.com/bmcfee/crema) — a neural network trained on 602 chord classes including:

- Major, minor
- Dominant 7th, major 7th, minor 7th, half-diminished, diminished 7th
- Augmented, sus2, sus4, major 6th, minor 6th, minor-major 7th

Low-confidence detections (below 45%) are flagged with `?` in the terminal output and a warning is added to the PDF if more than 30% of beats are uncertain.

---

## File structure

```
audio-tools/
├── pipeline.py              # Full pipeline runner
├── beat_stabilizer.py       # Beat detection & time-warping
├── chord_sheet.py           # Chord detection & beat alignment (library)
├── chord_chart_render.py    # PDF chart generator
├── requirements.txt         # System Python deps (beat stabilizer)
├── requirements_crema.txt   # crema venv deps (chord tools)
├── setup.sh                 # One-time setup script
└── venv_crema/              # Auto-created by setup.sh — do not commit
```
