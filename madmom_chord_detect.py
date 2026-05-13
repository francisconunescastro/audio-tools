#!/usr/bin/env python3
"""
madmom_chord_detect.py  —  Chord detection using madmom's deep chroma + CRF.

Produces the same beat-aligned JSON + PDF output as chord_chart_render.py,
using madmom's DeepChromaProcessor → DeepChromaChordRecognitionProcessor
pipeline instead of crema.

madmom uses a bidirectional RNN that sees context before and after each frame,
which handles harmonically close chords (e.g. A vs Bm) more reliably than
crema's frame-by-frame approach.

Run with the madmom venv:
    ./venv_madmom/bin/python3.11 madmom_chord_detect.py -i song.wav
    ./venv_madmom/bin/python3.11 madmom_chord_detect.py -i song.wav --title "My Song" --open
"""

import argparse
import json
import os
import subprocess
import sys

import numpy as np

# madmom's compiled Cython (hmm.pyx) references np.int / np.float / etc.,
# which were removed in NumPy 1.24.  Restore the aliases before any madmom
# module is imported so the compiled extension can initialise without error.
np.int     = int
np.float   = float
np.complex = complex
np.bool    = bool
np.object  = object
np.str     = str

# Re-use helpers from chord_chart_render that don't depend on crema
sys.path.insert(0, os.path.dirname(__file__))
from chord_chart_render import (
    read_bpm_sidecar,
    simplify_chord,
    find_bar_phase,
    hybrid_bar_chords,
    crema_to_display,
    _ly_key,
    guess_key,
    guess_key_display,
    key_override_to_display,
    generate_lilypond,
    CONFIDENCE_WARN,
)
from chord_sheet import (
    load_audio_mono,
    detect_beats,
    detect_time_signature,
)


# ---------------------------------------------------------------------------
# madmom detection
# ---------------------------------------------------------------------------

def detect_chords_madmom(audio_path: str) -> list[tuple[float, float, str]]:
    """
    Run madmom's DeepChroma + CRF chord recogniser on a WAV file.

    Returns a list of (start_sec, end_sec, label) segments,
    e.g. [(0.0, 1.7, 'N'), (1.7, 4.0, 'F#:min'), ...]
    """
    from madmom.audio.chroma import DeepChromaProcessor
    from madmom.features.chords import DeepChromaChordRecognitionProcessor
    from madmom.processors import SequentialProcessor

    chordrec = SequentialProcessor([
        DeepChromaProcessor(),
        DeepChromaChordRecognitionProcessor(),
    ])
    raw = chordrec(audio_path)
    return [(float(s), float(e), str(l)) for s, e, l in raw]


def segments_to_beat_chords(
    segments: list[tuple[float, float, str]],
    beat_times: np.ndarray,
) -> list[dict]:
    """
    Map madmom's time-segment chords onto the beat grid.

    For each beat window, pick the chord that occupies the most time.
    Confidence is estimated as the fraction of the beat window covered
    by the winning chord (1.0 = unambiguous, lower = split window).

    Returns the same beat_chords format used by chord_chart_render.
    """
    beat_results = []
    n_beats = len(beat_times)
    intervals = np.diff(beat_times)
    med_interval = float(np.median(intervals))

    for i, beat_t in enumerate(beat_times):
        t_end = beat_times[i + 1] if i + 1 < n_beats else beat_t + med_interval

        # Accumulate time per chord label within this beat window
        coverage: dict[str, float] = {}
        for seg_start, seg_end, label in segments:
            # Overlap of [seg_start, seg_end] with [beat_t, t_end]
            overlap = max(0.0, min(seg_end, t_end) - max(seg_start, beat_t))
            if overlap > 0:
                coverage[label] = coverage.get(label, 0.0) + overlap

        if not coverage:
            # No segment covers this beat — use nearest segment
            nearest = min(segments, key=lambda s: abs(s[0] - beat_t))
            label = nearest[2]
            confidence = 0.3
        else:
            total = sum(coverage.values())
            label = max(coverage, key=coverage.__getitem__)
            confidence = round(coverage[label] / total, 3)

        beat_results.append({
            "beat":       i + 1,
            "time":       float(beat_t),
            "chord":      label,
            "confidence": confidence,
        })

    return beat_results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Generate a PDF chord chart using madmom chord detection.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ./venv_madmom/bin/python3.11 madmom_chord_detect.py -i song.wav
  ./venv_madmom/bin/python3.11 madmom_chord_detect.py -i song.wav --key "f#:minor" --title "My Song"
  ./venv_madmom/bin/python3.11 madmom_chord_detect.py -i song.wav --add-7th --open
        """,
    )
    p.add_argument("-i", "--input",       required=True)
    p.add_argument("-o", "--output",      default=None,   help="Output base path (default: same dir as input)")
    p.add_argument("--title",             default=None,   help="Chart title (default: filename)")
    p.add_argument("--key",               default="auto", help="e.g. 'f#:minor' (default: auto)")
    p.add_argument("--time-sig",          type=int, default=None, dest="time_sig")
    p.add_argument("--bpm",               type=float, default=None)
    p.add_argument("--bars-per-line",     type=int, default=4, dest="bars_per_line")
    p.add_argument("--threshold",         type=float, default=CONFIDENCE_WARN)
    p.add_argument("--sample-rate",       type=int, default=44100)
    p.add_argument("--no-bpm",            action="store_true")
    p.add_argument("--no-key",            action="store_true")
    p.add_argument("--no-meter",          action="store_true")
    p.add_argument("--subtitle",          default=None)
    p.add_argument("--add-7th",           action="store_true", dest="add_7th")
    p.add_argument("--mid-bar-threshold", type=float, default=0.80, dest="mid_bar_threshold")
    p.add_argument("--open",              action="store_true")
    p.add_argument("--keep-ly",           action="store_true")
    p.add_argument("--dump-segments",     action="store_true", dest="dump_segments",
                   help="Print raw (start, end, label) segments as JSON to stdout and exit")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    if not os.path.isfile(args.input):
        sys.exit(f"File not found: {args.input}")

    # --dump-segments: just output raw segments as JSON and exit
    if args.dump_segments:
        segments = detect_chords_madmom(args.input)
        print(json.dumps([[s, e, l] for s, e, l in segments]))
        return

    title     = args.title or os.path.splitext(os.path.basename(args.input))[0]
    base      = args.output or os.path.splitext(args.input)[0]
    pdf_path  = base + "_madmom.pdf"
    ly_path   = base + "_madmom.ly"
    json_path = base + "_madmom.json"

    # 1. Load audio (for beat detection and time-sig)
    print(f"\n[1/5] Loading {args.input} …")
    y, sr = load_audio_mono(args.input, args.sample_rate)
    print(f"  {len(y)/sr:.1f}s  |  {sr} Hz  |  mono")

    # 2. Detect chords via madmom (operates on the file directly)
    print("\n[2/5] Detecting chords (madmom deep chroma + CRF) …")
    segments = detect_chords_madmom(args.input)
    non_silence = [(s, e, l) for s, e, l in segments if l != "N"]
    print(f"  {len(segments)} segments  |  {len(non_silence)} non-silence")

    # 3. Detect beats
    print("\n[3/5] Detecting beats …")
    beat_times = detect_beats(y, sr)
    sidecar_bpm = read_bpm_sidecar(args.input) if args.bpm is None else None
    bpm = args.bpm or sidecar_bpm or (60.0 / float(np.median(np.diff(beat_times))))
    print(f"  {len(beat_times)} beats  |  {bpm:.1f} BPM"
          + (" (from sidecar)" if sidecar_bpm else ""))

    # 4. Detect time signature
    if args.time_sig:
        beats_per_bar = args.time_sig
        print(f"\n[4/5] Time signature: {beats_per_bar}/4 (manual)")
    else:
        beats_per_bar = detect_time_signature(y, sr, beat_times)
        print(f"\n[4/5] Time signature: {beats_per_bar}/4 (auto-detected)")

    # 5. Align to beat grid, simplify, collapse to bars
    print("\n[5/5] Aligning chords to beat grid …")
    beat_chords = segments_to_beat_chords(segments, beat_times)
    beat_chords = [{**b, "chord": simplify_chord(b["chord"], add_7th=args.add_7th)}
                   for b in beat_chords]

    bar_phase = find_bar_phase(beat_chords, beats_per_bar)
    if bar_phase > 0:
        print(f"  Bar phase: offset {bar_phase} beat(s)")
        beat_chords = beat_chords[bar_phase:]

    bar_chords = hybrid_bar_chords(beat_chords, beats_per_bar, args.mid_bar_threshold)

    all_segs = [seg for bar in bar_chords for seg in bar["segments"]]
    low_conf = sum(1 for s in all_segs if s["confidence"] < args.threshold)
    low_pct  = 100 * low_conf / max(len(all_segs), 1)
    print(f"  Low-confidence segments: {low_conf}/{len(all_segs)} ({low_pct:.0f}%)")

    print("\n  Chord summary (changes only):")
    prev = None
    for bar in bar_chords:
        beat_pos = 1
        for seg in bar["segments"]:
            if seg["chord"] != prev:
                flag   = " ?" if seg["confidence"] < args.threshold else ""
                prefix = f"Bar {bar['bar']:>3}" if beat_pos == 1 else f"      beat {beat_pos}"
                print(f"    {prefix}  {seg['time']:>6.1f}s  "
                      f"{crema_to_display(seg['chord']):<8}  ({seg['confidence']:.0%}{flag})")
                prev = seg["chord"]
            beat_pos += seg["beats"]

    # Build subtitle
    key_stmt = _ly_key(args.key) if args.key != "auto" else guess_key(bar_chords)
    if args.subtitle is not None:
        subtitle = args.subtitle
    else:
        key_display = (key_override_to_display(args.key)
                       if args.key != "auto" else guess_key_display(bar_chords))
        parts = []
        if not args.no_meter: parts.append(f"Meter: {beats_per_bar}/4")
        if not args.no_key:   parts.append(f"Key: {key_display}")
        if not args.no_bpm:   parts.append(f"BPM: {round(bpm)}")
        subtitle = "  ·  ".join(parts)

    print(f"\nRendering PDF …  ({subtitle or 'no subtitle'})")
    ly_src = generate_lilypond(
        bar_chords, title=title, beats_per_bar=beats_per_bar,
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

    # Write analysis JSON
    beat_intervals = np.diff(beat_times)
    all_confs      = [seg["confidence"] for seg in all_segs]
    chord_changes  = sum(1 for k in range(1, len(all_segs))
                         if all_segs[k]["chord"] != all_segs[k-1]["chord"])
    analysis = {
        "input":          args.input,
        "title":          title,
        "detector":       "madmom",
        "time_signature": f"{beats_per_bar}/4",
        "key":            key_display if args.key == "auto" else key_override_to_display(args.key),
        "bars":           len(bar_chords),
        "chord_identification": {
            "mean_confidence":    round(float(np.mean(all_confs)), 3),
            "median_confidence":  round(float(np.median(all_confs)), 3),
            "low_confidence_pct": round(low_pct, 1),
            "chord_changes":      chord_changes,
        },
        "alignment": {
            "detected_bpm":     round(float(bpm), 2),
            "bpm_source":       "sidecar" if sidecar_bpm else "auto",
            "beat_count":       len(beat_times),
            "beat_interval_cv": round(float(np.std(beat_intervals) / np.mean(beat_intervals)), 4),
            "bar_phase_offset": bar_phase,
        },
    }
    with open(json_path, "w") as f:
        json.dump(analysis, f, indent=2)
    print(f"  Analysis  : {json_path}")

    if args.open:
        subprocess.run(["open", pdf_path])


if __name__ == "__main__":
    main()
