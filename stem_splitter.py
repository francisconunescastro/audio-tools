#!/usr/bin/env python3
"""
stem_splitter.py  —  Split an audio file into stems using Demucs.

Default model: htdemucs_6s  →  6 stems: vocals, drums, bass, guitar, piano, other
Fast model:    htdemucs     →  4 stems: vocals, drums, bass, other

Run with the demucs venv:
    ./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav
    ./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav --model htdemucs
    ./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav --stems vocals,drums

On first run, Demucs downloads the model weights (~80–320 MB, cached afterwards).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


# ---------------------------------------------------------------------------
# Progress reporting (enabled by --progress-json; no-op otherwise)
# ---------------------------------------------------------------------------

_PROGRESS_JSON = False


def _emit(sub: str, pct: float, msg: str | None = None) -> None:
    """Emit a single PROGRESS JSON line on stdout (local 0.0–1.0)."""
    if not _PROGRESS_JSON:
        return
    payload = {"sub": sub, "pct": float(pct)}
    if msg:
        payload["msg"] = msg
    sys.stdout.write(f"PROGRESS {json.dumps(payload)}\n")
    sys.stdout.flush()


# Demucs prints tqdm progress on stderr like:
#   " 23%|██▎       | 23/100 [00:..]"
# Capture the percentage at the start of each line.
_TQDM_PCT = re.compile(r"(\d+)%\|")


MODELS = {
    "htdemucs_6s": "6 stems (vocals, drums, bass, guitar, piano, other) — best coverage",
    "htdemucs":    "4 stems (vocals, drums, bass, other) — faster",
    "htdemucs_ft": "4 stems, fine-tuned — best quality on some material",
    "mdx_extra":   "4 stems, alternative architecture",
}


# ---------------------------------------------------------------------------
# Stem presence detection
# ---------------------------------------------------------------------------
#
# Demucs always returns every stem its model can output, including ones the
# song doesn't actually contain (e.g. "piano" on a track with no piano). The
# unwanted ones come back near-silent or as bleed. We detect this so the UI
# can label them honestly instead of offering empty downloads as if they were
# real takes.
#
# A stem is "present" iff there's at least one 2-second window anywhere in
# the file with sustained energy above PRESENCE_DB. Short bursts of bleed
# at the start or end don't qualify; an actual played part will easily clear
# the threshold over multiple consecutive 1-second windows.

PRESENCE_DB = -30.0   # dBFS threshold for a "loud" 1-second window
PRESENCE_WIN_S = 1.0  # window length in seconds (RMS measured per window)
PRESENCE_RUN_S = 2.0  # minimum consecutive seconds above threshold


def detect_stem_presence(wav_path: str) -> dict:
    """
    Return {"present": bool, "rms_dbfs_peak": float, "loud_seconds": float}
    for one stem WAV. `present` is True if at least PRESENCE_RUN_S of
    consecutive 1-second windows clear PRESENCE_DB.
    """
    import numpy as np

    # Try torchaudio first (always present in venv_demucs), fall back to
    # soundfile if someone runs this in a different env. Audio is normalised
    # to float32 in [-1, 1] either way.
    y = None
    sr = 0
    try:
        import torchaudio
        wav, sr_torch = torchaudio.load(wav_path)
        y = wav.mean(dim=0).numpy().astype(np.float32)  # mono mix
        sr = int(sr_torch)
    except Exception:
        try:
            import soundfile as sf
            data, sr_sf = sf.read(wav_path, always_2d=False)
            if data.ndim == 2:
                data = data.mean(axis=1)
            y = data.astype(np.float32)
            sr = int(sr_sf)
        except Exception as e:
            return {"present": True, "rms_dbfs_peak": 0.0, "loud_seconds": 0.0,
                    "error": f"could not load wav: {e}"}

    win = max(1, int(round(PRESENCE_WIN_S * sr)))
    n_full = (len(y) // win) * win
    if n_full == 0:
        return {"present": False, "rms_dbfs_peak": -120.0, "loud_seconds": 0.0}

    frames = y[:n_full].reshape(-1, win)
    # RMS per window, in dBFS (full scale = ±1.0)
    rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-12)
    rms_db = 20.0 * np.log10(rms)
    peak_db = float(rms_db.max())

    above = rms_db >= PRESENCE_DB
    # Longest run of consecutive "above" windows
    longest = 0
    current = 0
    for flag in above.tolist():
        if flag:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    loud_seconds = float(longest * PRESENCE_WIN_S)
    present = loud_seconds >= PRESENCE_RUN_S
    return {
        "present":      bool(present),
        "rms_dbfs_peak": round(peak_db, 2),
        "loud_seconds": round(loud_seconds, 2),
    }


def split(input_path: str, output_dir: str, model: str, wanted_stems: set[str] | None) -> list[str]:
    """
    Run Demucs separation and return list of output file paths.
    Files are moved out of Demucs's nested folder structure into output_dir directly.
    """
    os.makedirs(output_dir, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        cmd = [
            sys.executable, "-m", "demucs",
            "-n", model,
            "-o", tmp,
            input_path,
        ]
        print(f"  Model : {model}")
        print(f"  Loading model … (first run downloads weights, subsequent runs are instant)")
        _emit("demucs", 0.02, "starting demucs")

        # Stream demucs' tqdm output on stderr, parse percentages, re-emit
        # PROGRESS events. Pass stdout through unchanged.
        if _PROGRESS_JSON:
            proc = subprocess.Popen(
                cmd,
                stdout=None,            # inherit
                stderr=subprocess.PIPE,
                bufsize=0,
            )
            last_pct = 0.0
            buf = bytearray()
            assert proc.stderr is not None
            while True:
                ch = proc.stderr.read(1)
                if not ch:
                    break
                if ch in (b"\n", b"\r"):
                    line = buf.decode("utf-8", errors="replace")
                    sys.stderr.write(line + ch.decode("utf-8", errors="replace"))
                    sys.stderr.flush()
                    m = _TQDM_PCT.search(line)
                    if m:
                        pct = int(m.group(1)) / 100.0
                        # Map demucs 0..100 → 0.05..0.98 so we don't claim done before files are moved
                        scaled = 0.05 + pct * 0.93
                        if scaled > last_pct + 0.01:
                            last_pct = scaled
                            _emit("demucs", scaled)
                    buf.clear()
                else:
                    buf.append(ch[0])
            ret = proc.wait()
            if ret != 0:
                sys.exit(f"Demucs failed (exit {ret}).")
        else:
            result = subprocess.run(cmd)
            if result.returncode != 0:
                sys.exit(f"Demucs failed (exit {result.returncode}).")

        # Demucs outputs to: {tmp}/{model}/{track_name}/{stem}.wav
        track_name = Path(input_path).stem
        stems_dir = Path(tmp) / model / track_name
        if not stems_dir.exists():
            # Some models use a slightly different name — find it
            candidates = list(Path(tmp).rglob("*.wav"))
            if not candidates:
                sys.exit("Demucs produced no output files.")
            stems_dir = candidates[0].parent

        written = []
        presence: dict[str, dict] = {}
        for stem_file in sorted(stems_dir.glob("*.wav")):
            stem_name = stem_file.stem
            if wanted_stems and stem_name.lower() not in wanted_stems:
                continue
            dest = os.path.join(output_dir, f"{stem_name}.wav")
            shutil.move(str(stem_file), dest)
            size_mb = os.path.getsize(dest) / 1_000_000
            info = detect_stem_presence(dest)
            flag = "" if info["present"] else "  ⚠ low energy"
            print(f"  ✓  {stem_name:<10}  →  {dest}  ({size_mb:.1f} MB, "
                  f"peak {info['rms_dbfs_peak']:>5.1f} dBFS, "
                  f"{info['loud_seconds']:>4.1f}s loud){flag}")
            written.append(dest)
            presence[stem_name] = info

        # Write a sidecar JSON next to the stems so the pipeline / web layer
        # can read presence info without re-analysing the audio.
        info_path = os.path.join(output_dir, "stems_info.json")
        with open(info_path, "w") as f:
            json.dump({"stems": presence}, f, indent=2)

    return written


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Split an audio file into stems using Demucs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Models:
{"".join(f"  {k:<16} {v}{chr(10)}" for k, v in MODELS.items())}
Examples:
  ./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav
  ./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav --model htdemucs
  ./venv_demucs/bin/python3.11 stem_splitter.py -i song.wav --stems vocals,bass
        """,
    )
    p.add_argument("-i", "--input",      required=True, help="Input audio file")
    p.add_argument("-o", "--output-dir", default=None,  dest="output_dir",
                   help="Output folder (default: <input>_stems/)")
    p.add_argument("--model",  default="htdemucs_6s", choices=list(MODELS),
                   help="Demucs model to use (default: htdemucs_6s)")
    p.add_argument("--stems",  default=None,
                   help="Comma-separated stems to keep e.g. 'vocals,drums' (default: all)")
    p.add_argument("--progress-json", action="store_true", dest="progress_json",
                   help="Emit machine-readable PROGRESS JSON lines on stdout")
    return p.parse_args()


def main() -> None:
    global _PROGRESS_JSON
    args = parse_args()
    _PROGRESS_JSON = args.progress_json

    if not os.path.isfile(args.input):
        sys.exit(f"File not found: {args.input}")

    stem_root = os.path.splitext(args.input)[0]
    output_dir = args.output_dir or f"{stem_root}_stems"

    wanted = (
        {s.strip().lower() for s in args.stems.split(",")}
        if args.stems else None
    )

    print(f"\nStem splitter")
    print(f"  Input  : {args.input}")
    print(f"  Output : {output_dir}/")
    if wanted:
        print(f"  Stems  : {', '.join(sorted(wanted))}")
    print()

    files = split(args.input, output_dir, args.model, wanted)
    _emit("demucs", 1.0, "done")

    print(f"\nDone — {len(files)} stem(s) written to {output_dir}/")


if __name__ == "__main__":
    main()
