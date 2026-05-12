#!/usr/bin/env python3
"""
pipeline.py  —  Full pipeline: beat stabilize → chord chart PDF → stem split.

Run with system Python (python3):
    python3 pipeline.py -i song.wav
    python3 pipeline.py -i song.m4a --bpm 84 --title "My Song" --open
    python3 pipeline.py -i song.wav --skip-stabilize
    python3 pipeline.py -i song.wav --skip-stems
    python3 pipeline.py -i song.wav --stems vocals,drums

The stabiliser writes a BPM sidecar that the chord chart picks up
automatically, so you never have to pass --bpm twice.
"""

import argparse
import os
import subprocess
import sys


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Beat-stabilize → chord chart → stem split.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 pipeline.py -i song.wav
  python3 pipeline.py -i song.m4a --bpm 84 --title "My Song" --open
  python3 pipeline.py -i song.wav --strength 0.8 --key "bes:major"
  python3 pipeline.py -i song.wav --stems vocals,bass
  python3 pipeline.py -i already_stable.wav --skip-stabilize --open
        """,
    )
    # ── Input ───────────────────────────────────────────────
    p.add_argument("-i", "--input",  required=True, help="Input audio file")
    p.add_argument("--title",        default=None,  help="Chart title (default: filename)")
    p.add_argument("--open",         action="store_true", help="Open PDF when done")

    # ── Beat stabilizer ─────────────────────────────────────
    stab = p.add_argument_group("Beat stabilizer")
    stab.add_argument("--bpm",            type=float, default=None,
                      help="Target BPM (auto-detected if omitted)")
    stab.add_argument("--strength",       type=float, default=1.0, metavar="0-1",
                      help="Quantisation strength (default: 1.0)")
    stab.add_argument("--skip-stabilize", action="store_true",
                      help="Skip beat stabilization and use input directly")

    # ── Chord chart ─────────────────────────────────────────
    chart = p.add_argument_group("Chord chart")
    chart.add_argument("--key",           default="auto",
                       help="Key signature e.g. 'f:minor', 'bes:major' (default: auto)")
    chart.add_argument("--time-sig",      type=int, default=None, dest="time_sig",
                       help="Beats per bar (default: auto)")
    chart.add_argument("--bars-per-line", type=int, default=4, dest="bars_per_line")
    chart.add_argument("--no-bpm",        action="store_true", help="Omit BPM from chart subtitle")
    chart.add_argument("--no-key",        action="store_true", help="Omit key from chart subtitle")
    chart.add_argument("--no-meter",      action="store_true", help="Omit meter from chart subtitle")
    chart.add_argument("--subtitle",      default=None, help="Override entire subtitle text")

    # ── Stem splitter ────────────────────────────────────────
    stems = p.add_argument_group("Stem splitter")
    stems.add_argument("--skip-stems",  action="store_true", help="Skip stem splitting")
    stems.add_argument("--stems",       default=None,
                       help="Comma-separated stems to keep e.g. 'vocals,drums' (default: all)")
    stems.add_argument("--stem-model",  default="htdemucs_6s",
                       choices=["htdemucs_6s", "htdemucs", "htdemucs_ft", "mdx_extra"],
                       dest="stem_model",
                       help="Demucs model (default: htdemucs_6s = 6 stems)")

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

    script_dir      = os.path.dirname(os.path.abspath(__file__))
    crema_python    = os.path.join(script_dir, "venv_crema",  "bin", "python3.11")
    demucs_python   = os.path.join(script_dir, "venv_demucs", "bin", "python3.11")
    stabilizer      = os.path.join(script_dir, "beat_stabilizer.py")
    chart_render    = os.path.join(script_dir, "chord_chart_render.py")
    stem_splitter   = os.path.join(script_dir, "stem_splitter.py")

    for venv, name in [(crema_python, "venv_crema"), (demucs_python, "venv_demucs")]:
        if not os.path.isfile(venv):
            sys.exit(f"{name} not found at {venv}\nRun  bash setup.sh  first.")

    stem  = os.path.splitext(args.input)[0]
    title = args.title or os.path.basename(stem)

    # ── Step 1 / 3  —  Beat stabilization ───────────────────
    if args.skip_stabilize:
        print("\n[pipeline] Skipping beat stabilization.")
        stabilised = args.input
    else:
        stabilised = stem + "_stabilised.wav"
        cmd = [sys.executable, stabilizer, "-i", args.input, "-o", stabilised]
        if args.bpm:          cmd += ["--bpm", str(args.bpm)]
        if args.strength != 1.0: cmd += ["--strength", str(args.strength)]
        run(cmd, "STEP 1 / 3  —  Beat Stabilization")

    # ── Step 2 / 3  —  Chord chart ──────────────────────────
    chart_out = stem + "_chord_chart"
    cmd = [
        crema_python, chart_render,
        "-i", stabilised, "--title", title, "--output", chart_out,
        "--bars-per-line", str(args.bars_per_line),
    ]
    if args.key != "auto":        cmd += ["--key",      args.key]
    if args.time_sig:             cmd += ["--time-sig", str(args.time_sig)]
    if args.no_bpm:               cmd += ["--no-bpm"]
    if args.no_key:               cmd += ["--no-key"]
    if args.no_meter:             cmd += ["--no-meter"]
    if args.subtitle is not None: cmd += ["--subtitle", args.subtitle]
    if args.open:                 cmd += ["--open"]
    run(cmd, "STEP 2 / 3  —  Chord Chart")

    # ── Step 3 / 3  —  Stem splitting ───────────────────────
    if args.skip_stems:
        print("\n[pipeline] Skipping stem splitting.")
    else:
        stems_out = stem + "_stems"
        cmd = [
            demucs_python, stem_splitter,
            "-i", stabilised,
            "-o", stems_out,
            "--model", args.stem_model,
        ]
        if args.stems: cmd += ["--stems", args.stems]
        run(cmd, "STEP 3 / 3  —  Stem Splitting")

    # ── Summary ──────────────────────────────────────────────
    print(f"\n{'='*54}")
    print(f"  ✓  Pipeline complete!")
    if not args.skip_stabilize:
        print(f"     Stabilised audio : {stabilised}")
    print(f"     Chord chart PDF  : {chart_out}.pdf")
    if not args.skip_stems:
        print(f"     Stems            : {stem}_stems/")
    print(f"{'='*54}\n")


if __name__ == "__main__":
    main()
