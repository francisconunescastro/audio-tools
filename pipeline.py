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

Intro trim is on by default: the stabilised WAV starts exactly one bar
before the first detected beat, ready to drop into a DAW at bar 1.
Disable with --no-trim-intro.

Half-time songs (e.g. 78 BPM where the detector locks onto 156 BPM 8th
notes) are handled automatically when --bpm is supplied.  The stabiliser
compares beat count vs expected count and uses 2× anchor density when a
half-time groove is detected.
"""

from __future__ import annotations

import argparse
import json
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
    p.add_argument("-i", "--input",      required=True, help="Input audio file")
    p.add_argument("--title",            default=None,  help="Chart title (default: filename)")
    p.add_argument("--output-dir",       default=None,  dest="output_dir",
                   help="Directory for all output files (default: same as input)")
    p.add_argument("--open",             action="store_true", help="Open PDF when done")

    # ── Beat stabilizer ─────────────────────────────────────
    stab = p.add_argument_group("Beat stabilizer")
    stab.add_argument("--bpm",            type=float, default=None,
                      help="Target BPM (auto-detected if omitted)")
    stab.add_argument("--strength",       type=float, default=1.0, metavar="0-1",
                      help="Quantisation strength (default: 1.0)")
    stab.add_argument("--skip-stabilize", action="store_true",
                      help="Skip beat stabilization and use input directly")
    # Trim-intro is ON by default so the output drops into a DAW without manual
    # offsetting.  Pass --no-trim-intro to get the raw stabilised audio.
    stab.add_argument("--no-trim-intro",  action="store_false", dest="trim_intro",
                      help="Disable the default intro trim")
    stab.add_argument("--trim-intro",     action="store_true",  dest="trim_intro",
                      help="Start the output one bar before beat 1 (on by default; "
                           "silence-padded when the first beat is near the file start)")
    p.set_defaults(trim_intro=True)
    stab.add_argument("--beats-per-bar",  type=int, default=4, dest="beats_per_bar",
                      help="Beats per bar for the intro trim length (default: 4)")

    # ── Chord chart ─────────────────────────────────────────
    chart = p.add_argument_group("Chord chart")
    chart.add_argument("--key",           default="auto",
                       help="Key signature e.g. 'f:minor', 'bes:major' (default: auto)")
    chart.add_argument("--time-sig",      type=int, default=None, dest="time_sig",
                       help="Beats per bar (default: auto)")
    chart.add_argument("--bars-per-line", type=int, default=4, dest="bars_per_line")
    chart.add_argument("--no-bpm",          action="store_true", help="Omit BPM from chart subtitle")
    chart.add_argument("--no-key",          action="store_true", help="Omit key from chart subtitle")
    chart.add_argument("--no-meter",        action="store_true", help="Omit meter from chart subtitle")
    chart.add_argument("--subtitle",        default=None, help="Override entire subtitle text")
    chart.add_argument("--add-7th",         action="store_true", dest="add_7th",
                       help="Keep maj7, m7, dominant 7 chords (default: simplify to major/minor)")
    chart.add_argument("--mid-bar-threshold", type=float, default=0.80, dest="mid_bar_threshold",
                       help="Confidence threshold for mid-bar chord changes (default: 0.80)")
    chart.add_argument("--no-madmom-fallback",  action="store_false", dest="madmom_fallback",
                       help="Disable the default madmom fallback for low-confidence bars")
    chart.add_argument("--madmom-fallback",     action="store_true",  dest="madmom_fallback",
                       help="Re-evaluate low-confidence bars with madmom (on by default)")
    p.set_defaults(madmom_fallback=True)
    chart.add_argument("--madmom-threshold",   type=float, default=0.70, dest="madmom_threshold",
                       help="Bar mean-confidence below which madmom fallback triggers (default: 0.70)")
    chart.add_argument("--key-tiebreak",       action="store_true", dest="key_tiebreak",
                       help="Refine chromagram key by chord-root frequency (resolves major/minor ambiguity)")
    chart.add_argument("--key-snap",           action="store_true", dest="key_snap",
                       help="Snap non-diatonic low-confidence chords to the nearest diatonic equivalent")
    chart.add_argument("--key-snap-threshold", type=float, default=0.65, dest="key_snap_threshold",
                       help="Bars below this confidence are eligible for key snapping (default: 0.65)")
    chart.add_argument("--half-time",          action="store_true", dest="half_time",
                       help="Keep every other beat (fixes half-time grooves where the tracker "
                            "locks onto 8th notes). Auto-triggered when --bpm is ~half the detected rate.")
    chart.add_argument("--compound",           action="store_true", dest="compound",
                       help="Force 6/8 notation when beats-per-bar is 3 (auto-detected for most 6/8 songs).")

    # ── Stem splitter ────────────────────────────────────────
    stems = p.add_argument_group("Stem splitter")
    stems.add_argument("--skip-stems",  action="store_true", help="Skip stem splitting")
    stems.add_argument("--stems",       default=None,
                       help="Comma-separated stems to keep e.g. 'vocals,drums' (default: all)")
    stems.add_argument("--stem-model",  default="htdemucs_6s",
                       choices=["htdemucs_6s", "htdemucs", "htdemucs_ft", "mdx_extra"],
                       dest="stem_model",
                       help="Demucs model (default: htdemucs_6s = 6 stems)")

    p.add_argument("--progress-json", action="store_true", dest="progress_json",
                   help="Emit machine-readable PROGRESS JSON lines on stdout, "
                        "remapping each child stage onto a global 0..100 scale.")

    return p.parse_args()


# ---------------------------------------------------------------------------
# Progress remapping
# ---------------------------------------------------------------------------

_PROGRESS_JSON = False


def _emit_global(stage: str, pct: float, msg: str | None = None) -> None:
    """Emit a PROGRESS line on stdout in the global 0..100 scale."""
    if not _PROGRESS_JSON:
        return
    payload = {"stage": stage, "pct": round(float(pct), 2)}
    if msg:
        payload["msg"] = msg
    sys.stdout.write(f"PROGRESS {json.dumps(payload)}\n")
    sys.stdout.flush()


def run(cmd: list[str], label: str) -> None:
    print(f"\n{'='*54}")
    print(f"  {label}")
    print(f"{'='*54}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(f"\n✗  {label} failed (exit {result.returncode}).")


def run_with_progress(
    cmd: list[str],
    label: str,
    stage: str,
    pct_start: float,
    pct_end: float,
) -> None:
    """Run a child process, parsing PROGRESS JSON lines from its stdout and
    remapping them onto the global [pct_start, pct_end] window.

    Non-PROGRESS stdout is passed through unchanged so existing debug
    output is preserved.
    """
    print(f"\n{'='*54}")
    print(f"  {label}")
    print(f"{'='*54}")

    if not _PROGRESS_JSON:
        # Fast path: no progress parsing needed.
        result = subprocess.run(cmd)
        if result.returncode != 0:
            sys.exit(f"\n✗  {label} failed (exit {result.returncode}).")
        return

    _emit_global(stage, pct_start, label)
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=None,           # inherit — pipeline.py forwards demucs tqdm etc.
        bufsize=1,
        text=True,
    )
    assert proc.stdout is not None
    span = pct_end - pct_start
    for raw in proc.stdout:
        line = raw.rstrip("\n")
        if line.startswith("PROGRESS "):
            try:
                payload = json.loads(line[len("PROGRESS "):])
                local_pct = float(payload.get("pct", 0.0))
                global_pct = pct_start + max(0.0, min(1.0, local_pct)) * span
                _emit_global(stage, global_pct, payload.get("msg"))
                continue
            except (ValueError, json.JSONDecodeError):
                pass
        # Pass through any non-PROGRESS line unchanged
        sys.stdout.write(line + "\n")
        sys.stdout.flush()
    ret = proc.wait()
    if ret != 0:
        sys.exit(f"\n✗  {label} failed (exit {ret}).")
    _emit_global(stage, pct_end, f"{label} done")


def main() -> None:
    global _PROGRESS_JSON
    args = parse_args()
    _PROGRESS_JSON = args.progress_json

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

    input_base = os.path.splitext(os.path.basename(args.input))[0]
    base_dir   = os.path.abspath(args.output_dir) if args.output_dir else os.path.expanduser("~/Desktop/audio-tools-tests")
    out_dir    = os.path.join(base_dir, input_base)
    os.makedirs(out_dir, exist_ok=True)
    title = args.title or input_base

    # ── Global progress allocation ─────────────────────────
    # Default ranges: stabilize 0–10, chord 10–40, stems 40–100.
    # When a stage is skipped, its share is redistributed proportionally
    # across the remaining stages.
    weights = {
        "stabilize": 0.0 if args.skip_stabilize else 10.0,
        "chord":     30.0,
        "stems":     0.0 if args.skip_stems else 60.0,
    }
    total_w = sum(weights.values()) or 1.0
    scale   = 100.0 / total_w
    cursor  = 0.0
    ranges: dict[str, tuple[float, float]] = {}
    for stage in ("stabilize", "chord", "stems"):
        w = weights[stage] * scale
        ranges[stage] = (cursor, cursor + w)
        cursor += w

    _emit_global("start", 0.0, "pipeline starting")

    # ── Step 1 / 3  —  Beat stabilization ───────────────────
    if args.skip_stabilize:
        print("\n[pipeline] Skipping beat stabilization.")
        stabilised = args.input
    else:
        stabilised = os.path.join(out_dir, input_base + "_stabilised.wav")
        cmd = [sys.executable, stabilizer, "-i", args.input, "-o", stabilised]
        if args.bpm:                cmd += ["--bpm",           str(args.bpm)]
        if args.strength != 1.0:    cmd += ["--strength",      str(args.strength)]
        if not args.trim_intro:     cmd += ["--no-trim-intro"]
        if args.beats_per_bar != 4: cmd += ["--beats-per-bar", str(args.beats_per_bar)]
        if _PROGRESS_JSON:          cmd += ["--progress-json"]
        run_with_progress(
            cmd, "STEP 1 / 3  —  Beat Stabilization",
            "stabilize", *ranges["stabilize"],
        )

    # ── Step 2 / 3  —  Chord chart ──────────────────────────
    chart_out = os.path.join(out_dir, input_base + "_chord_chart")
    cmd = [
        crema_python, chart_render,
        "-i", stabilised, "--title", title, "--output", chart_out,
        "--bars-per-line", str(args.bars_per_line),
    ]
    if args.key != "auto":              cmd += ["--key",              args.key]
    if args.bpm and args.skip_stabilize: cmd += ["--bpm",             str(args.bpm)]
    if args.time_sig:                   cmd += ["--time-sig",         str(args.time_sig)]
    if args.no_bpm:                     cmd += ["--no-bpm"]
    if args.no_key:                     cmd += ["--no-key"]
    if args.no_meter:                   cmd += ["--no-meter"]
    if args.subtitle is not None:       cmd += ["--subtitle",         args.subtitle]
    if args.add_7th:                    cmd += ["--add-7th"]
    if args.mid_bar_threshold != 0.80:  cmd += ["--mid-bar-threshold", str(args.mid_bar_threshold)]
    if not args.madmom_fallback:              cmd += ["--no-madmom-fallback"]
    if args.madmom_threshold != 0.70:         cmd += ["--madmom-threshold",   str(args.madmom_threshold)]
    if args.key_tiebreak:                     cmd += ["--key-tiebreak"]
    if args.key_snap:                         cmd += ["--key-snap"]
    if args.key_snap_threshold != 0.65:       cmd += ["--key-snap-threshold", str(args.key_snap_threshold)]
    if args.half_time:                        cmd += ["--half-time"]
    if args.compound:                         cmd += ["--compound"]
    if args.open:                             cmd += ["--open"]
    if _PROGRESS_JSON:                        cmd += ["--progress-json"]
    run_with_progress(
        cmd, "STEP 2 / 3  —  Chord Chart",
        "chord", *ranges["chord"],
    )

    # ── Step 3 / 3  —  Stem splitting ───────────────────────
    if args.skip_stems:
        print("\n[pipeline] Skipping stem splitting.")
    else:
        stems_out = os.path.join(out_dir, input_base + "_stems")
        cmd = [
            demucs_python, stem_splitter,
            "-i", stabilised,
            "-o", stems_out,
            "--model", args.stem_model,
        ]
        if args.stems: cmd += ["--stems", args.stems]
        if _PROGRESS_JSON: cmd += ["--progress-json"]
        run_with_progress(
            cmd, "STEP 3 / 3  —  Stem Splitting",
            "stems", *ranges["stems"],
        )

    # ── Summary ──────────────────────────────────────────────
    print(f"\n{'='*54}")
    print(f"  ✓  Pipeline complete!")
    if not args.skip_stabilize:
        print(f"     Stabilised audio : {stabilised}")
    print(f"     Chord chart PDF  : {chart_out}.pdf")
    print(f"     Analysis JSON    : {chart_out}.json")
    if not args.skip_stems:
        print(f"     Stems            : {stems_out}/")
    print(f"{'='*54}\n")
    _emit_global("done", 100.0, "pipeline complete")


if __name__ == "__main__":
    main()
