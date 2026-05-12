#!/usr/bin/env python3
"""
chord_chart_render.py  —  Visual PDF chord chart from an audio file.

Detects chords via crema, aligns them to a beat grid, and renders a
LilyPond lead-sheet PDF with chord symbols above blank staff lines.

If the input file has a companion <file>.bpm sidecar (written by
beat_stabilizer.py), that BPM is used automatically — no need to pass
--bpm manually after running the stabiliser.

Run with the crema venv:
    ./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav
    ./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --key "f:minor" --title "My Song"
    ./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --no-bpm --bars-per-line 4
"""

import argparse
import os
import subprocess
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from chord_sheet import (
    load_audio_mono,
    detect_chords_crema,
    detect_beats,
    detect_time_signature,
    beat_sync_chords,
    CONFIDENCE_WARN,
)


# ---------------------------------------------------------------------------
# BPM sidecar
# ---------------------------------------------------------------------------

def read_bpm_sidecar(audio_path: str) -> float | None:
    """Return BPM from <audio_path>.bpm if it exists, else None."""
    sidecar = audio_path + ".bpm"
    if os.path.isfile(sidecar):
        try:
            bpm = float(open(sidecar).read().strip())
            print(f"  BPM sidecar found: {bpm} BPM")
            return bpm
        except ValueError:
            pass
    return None


# ---------------------------------------------------------------------------
# Crema label → LilyPond conversion
# ---------------------------------------------------------------------------

_ROOT_TO_LY = {
    "C":  "c",   "C#": "des",  "Db": "des",
    "D":  "d",   "D#": "ees",  "Eb": "ees",
    "E":  "e",   "Fb": "e",
    "F":  "f",   "F#": "ges",  "Gb": "ges",
    "G":  "g",   "G#": "aes",  "Ab": "aes",
    "A":  "a",   "A#": "bes",  "Bb": "bes",
    "B":  "b",   "Cb": "b",
}

_QUALITY_TO_LY = {
    "maj":     "",       "min":     ":m",
    "7":       ":7",     "maj7":    ":maj7",
    "min7":    ":m7",    "dim":     ":dim",
    "dim7":    ":dim7",  "hdim7":   ":m7.5-",
    "aug":     ":aug",   "sus2":    ":sus2",
    "sus4":    ":sus4",  "maj6":    ":6",
    "min6":    ":m6",    "minmaj7": ":m7+",
}

_QUALITY_DISPLAY = {
    "maj":     "",       "min":     "m",
    "7":       "7",      "maj7":    "maj7",
    "min7":    "m7",     "dim":     "dim",
    "dim7":    "dim7",   "hdim7":   "ø7",
    "aug":     "aug",    "sus2":    "sus2",
    "sus4":    "sus4",   "maj6":    "6",
    "min6":    "m6",     "minmaj7": "mM7",
}


def crema_to_ly(label: str) -> tuple[str, str]:
    if label in ("N", "X", ""):
        return ("s", "")
    root, quality = label.split(":", 1) if ":" in label else (label, "maj")
    return (_ROOT_TO_LY.get(root, root.lower()), _QUALITY_TO_LY.get(quality, f":{quality}"))


def crema_to_display(label: str) -> str:
    if label in ("N", "X", ""):
        return ""
    root, quality = label.split(":", 1) if ":" in label else (label, "maj")
    display_root = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}.get(root, root)
    return f"{display_root}{_QUALITY_DISPLAY.get(quality, quality)}"


# ---------------------------------------------------------------------------
# Beat data → bar-level LilyPond chord strings
# ---------------------------------------------------------------------------

def beats_to_bars(beat_chords: list[dict], beats_per_bar: int) -> list[list[dict]]:
    return [beat_chords[i:i + beats_per_bar] for i in range(0, len(beat_chords), beats_per_bar)]


_BEAT_TO_DUR = {1: "4", 2: "2", 3: "2.", 4: "1"}


def _ly_chord_token(label: str, beats: int) -> str:
    root, qual = crema_to_ly(label)
    if root == "s":
        return " ".join("s4" for _ in range(beats))
    return f"{root}{_BEAT_TO_DUR.get(beats, '4')}{qual}"


def bar_to_chord_events(bar: list[dict]) -> str:
    labels = [b["chord"] for b in bar]
    tokens, i = [], 0
    while i < len(labels):
        run = 1
        while i + run < len(labels) and labels[i + run] == labels[i]:
            run += 1
        tokens.append(_ly_chord_token(labels[i], run))
        i += run
    return " ".join(tokens)


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

def _ly_key(key_str: str) -> str:
    root, mode = (key_str + ":major").split(":")[:2]
    ly_root = _ROOT_TO_LY.get(root.capitalize(), root.lower())
    return f"\\key {ly_root} \\{mode}"


def guess_key(beat_chords: list[dict]) -> str:
    from collections import Counter
    roots = [lbl.split(":") for b in beat_chords if ":" in (lbl := b["chord"])]
    if not roots:
        return "\\key c \\major"
    root, qual = Counter(tuple(r) for r in roots).most_common(1)[0][0]
    return f"\\key {_ROOT_TO_LY.get(root, root.lower())} \\{'minor' if 'min' in qual else 'major'}"


def guess_key_display(beat_chords: list[dict]) -> str:
    from collections import Counter
    roots = [lbl.split(":") for b in beat_chords if ":" in (lbl := b["chord"])]
    if not roots:
        return "C"
    root, qual = Counter(tuple(r) for r in roots).most_common(1)[0][0]
    display_root = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}.get(root, root)
    return f"{display_root}{'m' if 'min' in qual else ''}"


def key_override_to_display(key_str: str) -> str:
    root, mode = (key_str + ":major").split(":")[:2]
    _LY_TO_DISPLAY = {
        "c": "C", "des": "Db", "d": "D", "ees": "Eb", "e": "E",
        "f": "F", "ges": "Gb", "g": "G", "aes": "Ab", "a": "A",
        "bes": "Bb", "b": "B",
    }
    return f"{_LY_TO_DISPLAY.get(root.lower(), root.capitalize())}{'m' if 'minor' in mode else ''}"


# ---------------------------------------------------------------------------
# LilyPond generation
# ---------------------------------------------------------------------------

def generate_lilypond(
    beat_chords: list[dict],
    title: str,
    beats_per_bar: int,
    key_stmt: str,
    bars_per_line: int,
    low_conf_pct: float,
    subtitle: str = "",
) -> str:
    bars = beats_to_bars(beat_chords, beats_per_bar)
    bar_spacer = {2: "s2", 3: "s2.", 4: "s1"}.get(beats_per_bar, "s1")

    chord_lines, spacer_lines = [], []
    for i, bar in enumerate(bars):
        chord_line = bar_to_chord_events(bar)
        short = beats_per_bar - len(bar)
        if short > 0:
            chord_line += " " + " ".join("s4" for _ in range(short))
        chord_lines.append(chord_line)
        spacer_lines.append(bar_spacer)
        if (i + 1) % bars_per_line == 0 and i < len(bars) - 1:
            spacer_lines.append("\\break")

    subtitle_line = f'  subtitle = \\markup {{ \\italic "{subtitle}" }}' if subtitle else ""
    warning = (
        '\\markup {\n  \\vspace #1\n'
        f'  \\italic "⚠  Low confidence ({low_conf_pct:.0f}% of beats) — verify manually."\n}}'
        if low_conf_pct > 30 else ""
    )

    # Pre-compute joined strings (backslashes not allowed inside f-string expressions in Python ≤3.11)
    chord_body  = " |\n    ".join(chord_lines)
    spacer_body = "\n      ".join(spacer_lines)

    return f"""\
\\version "2.26.0"

\\header {{
  title = \\markup {{ \\bold \\fontsize #4 "{title}" }}
{subtitle_line}
  tagline = ""
}}

\\paper {{
  #(set-paper-size "a4")
  top-margin = 20\\mm
  left-margin = 15\\mm
  right-margin = 15\\mm
  markup-system-spacing =
    #'((basic-distance . 14)
       (minimum-distance . 10)
       (padding . 4)
       (stretchability . 10))
  system-system-spacing =
    #'((basic-distance . 16)
       (minimum-distance . 12)
       (padding . 2)
       (stretchability . 20))
}}

theChords = \\chordmode {{
    {chord_body}
}}

\\score {{
  <<
    \\new ChordNames {{
      \\set chordChanges = ##t
      \\override ChordNames.ChordName.font-size = #1
      \\theChords
    }}
    \\new Staff {{
      {key_stmt}
      \\time {beats_per_bar}/4
      \\override Staff.Clef.stencil = ##f
      \\override Staff.TimeSignature.stencil = ##f
      {spacer_body}
    }}
  >>
  \\layout {{
    \\context {{
      \\Score
      \\override SpacingSpanner.base-shortest-duration = #(ly:make-moment 1/8)
    }}
  }}
}}

{warning}
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Generate a PDF chord chart from an audio file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav
  ./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --key "bes:major" --title "My Song"
  ./venv_crema/bin/python3.11 chord_chart_render.py -i song.wav --no-bpm --bars-per-line 4
        """,
    )
    p.add_argument("-i", "--input",       required=True)
    p.add_argument("-o", "--output",      default=None,   help="Output PDF path (default: same dir as input)")
    p.add_argument("--title",             default=None,   help="Chart title (default: filename)")
    p.add_argument("--key",               default="auto", help="e.g. 'f:minor', 'bes:major' (default: auto)")
    p.add_argument("--time-sig",          type=int, default=None, dest="time_sig", help="Beats per bar (default: auto)")
    p.add_argument("--bpm",               type=float, default=None, help="Override BPM (default: sidecar or auto)")
    p.add_argument("--bars-per-line",     type=int, default=4, dest="bars_per_line")
    p.add_argument("--threshold",         type=float, default=CONFIDENCE_WARN)
    p.add_argument("--sample-rate",       type=int, default=44100)
    p.add_argument("--no-bpm",            action="store_true", help="Omit BPM from subtitle")
    p.add_argument("--no-key",            action="store_true", help="Omit key from subtitle")
    p.add_argument("--no-meter",          action="store_true", help="Omit meter from subtitle")
    p.add_argument("--subtitle",          default=None,   help="Override entire subtitle ('' to hide)")
    p.add_argument("--open",              action="store_true", help="Open PDF when done")
    p.add_argument("--keep-ly",           action="store_true", help="Keep the .ly source file")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    if not os.path.isfile(args.input):
        sys.exit(f"File not found: {args.input}")

    title    = args.title or os.path.splitext(os.path.basename(args.input))[0]
    base     = args.output or os.path.splitext(args.input)[0]
    pdf_path = base + ".pdf"
    ly_path  = base + ".ly"

    # 1. Load
    print(f"\n[1/5] Loading {args.input} …")
    y, sr = load_audio_mono(args.input, args.sample_rate)
    print(f"  {len(y)/sr:.1f}s  |  {sr} Hz  |  mono")

    # 2. Detect chords
    print("\n[2/5] Detecting chords (crema) …")
    times, confidence, labels = detect_chords_crema(y, sr)
    hop = int(round((times[1] - times[0]) * sr)) if len(times) > 1 else 4096
    print(f"  {len(times)} frames  |  mean confidence: {confidence.mean():.1%}")

    # 3. Detect beats — prefer explicit flag, then sidecar, then auto
    print("\n[3/5] Detecting beats …")
    beat_times = detect_beats(y, sr)
    sidecar_bpm = read_bpm_sidecar(args.input) if args.bpm is None else None
    bpm = args.bpm or sidecar_bpm or (60.0 / np.median(np.diff(beat_times)))
    print(f"  {len(beat_times)} beats  |  {bpm:.1f} BPM"
          + (" (from sidecar)" if sidecar_bpm else ""))

    # 4. Detect time signature
    if args.time_sig:
        beats_per_bar = args.time_sig
        print(f"\n[4/5] Time signature: {beats_per_bar}/4 (manual)")
    else:
        beats_per_bar = detect_time_signature(y, sr, beat_times)
        print(f"\n[4/5] Time signature: {beats_per_bar}/4 (auto-detected)")

    # 5. Align chords to beats
    print(f"\n[5/5] Aligning chords to beat grid …")
    beat_chords = beat_sync_chords(times, confidence, labels, beat_times, sr, hop)

    low_conf = sum(1 for b in beat_chords if b["confidence"] < args.threshold)
    low_pct  = 100 * low_conf / max(len(beat_chords), 1)
    print(f"  Low-confidence beats: {low_conf}/{len(beat_chords)} ({low_pct:.0f}%)")

    print("\n  Chord summary (changes only):")
    prev = None
    for b in beat_chords:
        if b["chord"] != prev:
            flag = " ?" if b["confidence"] < args.threshold else ""
            print(f"    Beat {b['beat']:>3}  {b['time']:>6.1f}s  {crema_to_display(b['chord']):<8}  ({b['confidence']:.0%}{flag})")
            prev = b["chord"]

    # Build subtitle
    key_stmt = _ly_key(args.key) if args.key != "auto" else guess_key(beat_chords)
    if args.subtitle is not None:
        subtitle = args.subtitle
    else:
        key_display = key_override_to_display(args.key) if args.key != "auto" else guess_key_display(beat_chords)
        parts = []
        if not args.no_meter: parts.append(f"Meter: {beats_per_bar}/4")
        if not args.no_key:   parts.append(f"Key: {key_display}")
        if not args.no_bpm:   parts.append(f"BPM: {round(bpm)}")
        subtitle = "  ·  ".join(parts)

    print(f"\nRendering PDF …  ({subtitle or 'no subtitle'})")
    ly_src = generate_lilypond(
        beat_chords, title=title, beats_per_bar=beats_per_bar,
        key_stmt=key_stmt, bars_per_line=args.bars_per_line,
        low_conf_pct=low_pct, subtitle=subtitle,
    )

    with open(ly_path, "w") as f:
        f.write(ly_src)

    result = subprocess.run(
        ["lilypond", "--output", os.path.splitext(pdf_path)[0], ly_path],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print("LilyPond error:\n", result.stderr[-2000:])
        sys.exit(1)

    if not args.keep_ly:
        os.unlink(ly_path)

    print(f"\n  PDF saved: {pdf_path}")
    if args.open:
        subprocess.run(["open", pdf_path])


if __name__ == "__main__":
    main()
