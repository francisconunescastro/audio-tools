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

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


MODELS = {
    "htdemucs_6s": "6 stems (vocals, drums, bass, guitar, piano, other) — best coverage",
    "htdemucs":    "4 stems (vocals, drums, bass, other) — faster",
    "htdemucs_ft": "4 stems, fine-tuned — best quality on some material",
    "mdx_extra":   "4 stems, alternative architecture",
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
        for stem_file in sorted(stems_dir.glob("*.wav")):
            stem_name = stem_file.stem
            if wanted_stems and stem_name.lower() not in wanted_stems:
                continue
            dest = os.path.join(output_dir, f"{stem_name}.wav")
            shutil.move(str(stem_file), dest)
            size_mb = os.path.getsize(dest) / 1_000_000
            print(f"  ✓  {stem_name:<10}  →  {dest}  ({size_mb:.1f} MB)")
            written.append(dest)

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
    return p.parse_args()


def main() -> None:
    args = parse_args()

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

    print(f"\nDone — {len(files)} stem(s) written to {output_dir}/")


if __name__ == "__main__":
    main()
