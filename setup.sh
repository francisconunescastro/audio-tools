#!/usr/bin/env bash
# setup.sh  —  One-time setup for audio-tools.
# Run once after cloning:  bash setup.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║          audio-tools  setup              ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. System dependencies ──────────────────────────────────
echo ""
echo "[ 1 / 6 ]  System dependencies"

if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v brew &>/dev/null; then
        echo "  ✗  Homebrew not found."
        echo "     Install it from https://brew.sh then re-run this script."
        exit 1
    fi
    echo "  Installing python@3.11, rubberband, ffmpeg via Homebrew …"
    brew install python@3.11 rubberband ffmpeg
else
    echo "  Linux detected. Checking for required system packages …"
    MISSING=()
    command -v python3.11  &>/dev/null || MISSING+=("python3.11")
    command -v rubberband  &>/dev/null || MISSING+=("rubberband-cli")
    command -v ffmpeg      &>/dev/null || MISSING+=("ffmpeg")
    if [ ${#MISSING[@]} -gt 0 ]; then
        echo "  Missing: ${MISSING[*]}"
        echo "  Install with:  sudo apt install ${MISSING[*]}"
        exit 1
    fi
    echo "  All system dependencies found."
fi

# ── 2. System Python — beat stabilizer deps ─────────────────
echo ""
echo "[ 2 / 6 ]  Beat stabilizer dependencies (system Python)"
python3 -m pip install -r requirements.txt --break-system-packages 2>/dev/null \
    || python3 -m pip install -r requirements.txt
echo "  ✓  Done"

# ── 3. Create crema venv (Python 3.11) ──────────────────────
echo ""
echo "[ 3 / 6 ]  Creating crema virtual environment (Python 3.11) …"
python3.11 -m venv venv_crema
./venv_crema/bin/pip install --upgrade pip --quiet
# setuptools<70 must come before crema to restore pkg_resources
./venv_crema/bin/pip install "setuptools<70" --quiet
./venv_crema/bin/pip install -r requirements_crema.txt
echo "  ✓  venv_crema ready"

# ── 4. Create madmom venv (Python 3.11) ─────────────────────
#
# madmom's Cython extensions must be compiled against NumPy <2.0 and
# require numpy + Cython to be present *before* madmom is installed
# (its setup.py imports numpy at build time).
#
# On Apple Silicon, ARCHFLAGS is set so the extensions compile for arm64.
# On Intel / Linux the variable is a no-op.
echo ""
echo "[ 4 / 6 ]  Creating madmom virtual environment (Python 3.11) …"
python3.11 -m venv venv_madmom
./venv_madmom/bin/pip install --upgrade pip --quiet

# Step 1: install build dependencies first
./venv_madmom/bin/pip install "numpy>=1.20,<2.0" Cython --quiet

# Step 2: install madmom (compiles Cython extensions against the numpy above)
if [[ "$(uname -m)" == "arm64" ]]; then
    echo "  Apple Silicon detected — setting ARCHFLAGS for arm64 …"
    ARCHFLAGS="-arch arm64" ./venv_madmom/bin/pip install madmom
else
    ./venv_madmom/bin/pip install madmom
fi

# Step 3: install remaining runtime deps
./venv_madmom/bin/pip install -r requirements_madmom.txt --quiet
echo "  ✓  venv_madmom ready"

# ── 5. Create demucs venv (Python 3.11) ─────────────────────
echo ""
echo "[ 5 / 6 ]  Creating demucs virtual environment (Python 3.11) …"
python3.11 -m venv venv_demucs
./venv_demucs/bin/pip install --upgrade pip --quiet
./venv_demucs/bin/pip install -r requirements_demucs.txt
echo "  ✓  venv_demucs ready"

# ── 6. Verify LilyPond ──────────────────────────────────────
echo ""
echo "[ 6 / 6 ]  Checking LilyPond …"
if ! command -v lilypond &>/dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  Installing LilyPond via Homebrew …"
        brew install lilypond
    else
        echo "  ✗  LilyPond not found. Install with:  sudo apt install lilypond"
        exit 1
    fi
fi
echo "  ✓  LilyPond $(lilypond --version 2>&1 | head -1 | awk '{print $3}')"

# ── Done ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✓  Setup complete!                      ║"
echo "║                                          ║"
echo "║  Full pipeline:                          ║"
echo "║    python3 pipeline.py -i song.wav       ║"
echo "║                                          ║"
echo "║  Individual tools:                       ║"
echo "║    python3 beat_stabilizer.py -i song.wav -o out.wav"
echo "║    ./venv_crema/bin/python3.11 chord_chart_render.py -i out.wav"
echo "║    ./venv_demucs/bin/python3.11 stem_splitter.py -i out.wav"
echo "╚══════════════════════════════════════════╝"
echo ""
