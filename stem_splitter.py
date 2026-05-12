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
import sys
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
    from demucs.api import Separator, save_audio
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"  Model : {model}  |  Device: {device}")
    if device == "cpu":
        print("  (No GPU found — running on CPU, this may take a few minutes)")

    print(f"  Loading model … (first run downloads weights, subsequent runs are instant)")
    separator = Separator(model, device=device)

    print(f"  Separating …")
    origin, separated = separator.separate_audio_file(Path(input_path))

    os.makedirs(output_dir, exist_ok=True)
    written = []

    for stem_name, audio in separated.items():
        if wanted_stems and stem_name.lower() not in wanted_stems:
            continue
        out_path = os.path.join(output_dir, f"{stem_name}.wav")
        save_audio(audio, Path(out_path), samplerate=separator.samplerate)
        size_mb = os.path.getsize(out_path) / 1_000_000
        print(f"  ✓  {stem_name:<10}  →  {out_path}  ({size_mb:.1f} MB)")
        written.append(out_path)

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
