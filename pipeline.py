#!/usr/bin/env python3
"""
pipeline.py  —  Full pipeline: beat stabilize → chord chart PDF.

Run with system Python (python3):
    python3 pipeline.py -i song.wav
    python3 pipeline.py -i song.m4a --bpm 84 --title "My Song" --open
    python3 pipeline.py -i song.wav --skip-stabilize   # chord chart only

The stabiliser writes a BPM sidecar that the chord chart picks up
automatically, so you never have to pass --bpm twice.
"""

import argparse
import os
import subprocess
import sys


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Beat-stabilize an audio file then generate a chord chart PDF.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 pipeline.py -i song.wav
  python3 pipeline.py -i song.m4a --bpm 84 --title "My Song" --open
  python3 pipeline.py -i song.wav --strength 0.8 --key "bes:major"
  python3 pipeline.py -i already_stable.wav --skip-stabilize --open
        """,
    )
    # ── Input / output ──────────────────────────────────────
    p.add_argument("-i", "--input",       required=True,  help="Input audio file")
    p.add_argument("--title",             default=None,   help="Chart title (default: filename)")
    p.add_argument("--open",              action="store_true", help="Open PDF when done")

    # ── Beat stabilizer ─────────────────────────────────────
    stab = p.add_argument_group("Beat stabilizer")
    stab.add_argument("--bpm",            type=float, default=None, help="Target BPM (auto-detected if omitted)")
    stab.add_argument("--strength",       type=float, default=1.0,  metavar="0-1", help="Quantisation strength (default 1.0)")
    stab.add_argument("--skip-stabilize", action="store_true", help="Skip beat stabilization, run chord chart directly on input")

    # ── Chord chart ─────────────────────────────────────────
    chart = p.add_argument_group("Chord chart")
    chart.add_argument("--key",           default="auto", help="Key signature e.g. 'f:minor', 'bes:major' (default: auto)")
    chart.add_argument("--time-sig",      type=int, default=None, dest="time_sig", help="Beats per bar (default: auto)")
    chart.add_argument("--bars-per-line", type=int, default=4,    dest="bars_per_line")
    chart.add_argument("--no-bpm",        action="store_true", help="Omit BPM from chart subtitle")
    chart.add_argument("--no-key",        action="store_true", help="Omit key from chart subtitle")
    chart.add_argument("--no-meter",      action="store_true", help="Omit meter from chart subtitle")
    chart.add_argument("--subtitle",      default=None,        help="Override entire subtitle text")

    return p.parse_args()


def run(cmd: list[str], label: str) -> None:
    print(f"\n{'='*54}")
    print(f"  {label}")
    print(f"{'='*54}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(f"\n✗  {label} failed (exit {result.returncode}).")


def main() -> None:
    args = parse_args()

    if not os.path.isfile(args.input):
        sys.exit(f"File not found: {args.input}")

    script_dir   = os.path.dirname(os.path.abspath(__file__))
    venv_python  = os.path.join(script_dir, "venv_crema", "bin", "python3.11")
    stabilizer   = os.path.join(script_dir, "beat_stabilizer.py")
    chart_render = os.path.join(script_dir, "chord_chart_render.py")

    if not os.path.isfile(venv_python):
        sys.exit(
            f"crema venv not found at {venv_python}\n"
            "Run  bash setup.sh  first to set everything up."
        )

    stem  = os.path.splitext(args.input)[0]
    title = args.title or os.path.basename(stem)

    # ── Step 1: Beat stabilization ──────────────────────────
    if args.skip_stabilize:
        print("\n[pipeline] Skipping beat stabilization.")
        audio_for_chords = args.input
    else:
        stabilised = stem + "_stabilised.wav"
        cmd = [sys.executable, stabilizer, "-i", args.input, "-o", stabilised]
        if args.bpm:
            cmd += ["--bpm", str(args.bpm)]
        if args.strength != 1.0:
            cmd += ["--strength", str(args.strength)]
        run(cmd, "STEP 1 / 2  —  Beat Stabilization")
        audio_for_chords = stabilised

    # ── Step 2: Chord chart ─────────────────────────────────
    chart_out = stem + "_chord_chart"
    cmd = [
        venv_python, chart_render,
        "-i",       audio_for_chords,
        "--title",  title,
        "--output", chart_out,
        "--bars-per-line", str(args.bars_per_line),
    ]
    if args.key != "auto":      cmd += ["--key",      args.key]
    if args.time_sig:           cmd += ["--time-sig", str(args.time_sig)]
    if args.no_bpm:             cmd += ["--no-bpm"]
    if args.no_key:             cmd += ["--no-key"]
    if args.no_meter:           cmd += ["--no-meter"]
    if args.subtitle is not None: cmd += ["--subtitle", args.subtitle]
    if args.open:               cmd += ["--open"]
    # BPM is passed automatically via sidecar — no need to repeat it here

    run(cmd, "STEP 2 / 2  —  Chord Chart")

    print(f"\n{'='*54}")
    print(f"  ✓  Pipeline complete!")
    if not args.skip_stabilize:
        print(f"     Stabilised audio : {audio_for_chords}")
    print(f"     Chord chart PDF  : {chart_out}.pdf")
    print(f"{'='*54}\n")


if __name__ == "__main__":
    main()
