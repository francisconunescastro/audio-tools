#!/usr/bin/env python3
"""
beat_stabilizer.py - Stabilize audio to a consistent BPM grid.

Detects beats in an audio file (or accepts a manual BPM), then warps
the audio so every beat lands on an even musical grid — like Ableton's
"warp to grid" feature but from the command line.

After saving, writes a <output>.bpm sidecar file so downstream tools
(chord_chart_render.py, pipeline.py) can pick up the exact target BPM
without re-detecting it.

Usage:
    python3 beat_stabilizer.py -i input.mp3 -o output.wav
    python3 beat_stabilizer.py -i input.wav -o output.wav --bpm 120
    python3 beat_stabilizer.py -i input.aiff -o output.wav --strength 0.75
    python3 beat_stabilizer.py -i song.m4a --detect-only
"""

import argparse
import os
import sys
import tempfile

import numpy as np
import soundfile as sf
import librosa
import pyrubberband as pyrb


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

SUPPORTED_INPUT = {".mp3", ".wav", ".aiff", ".aif", ".m4a", ".flac", ".ogg"}


def load_audio(path: str, sr: int = 44100) -> tuple[np.ndarray, int]:
    ext = os.path.splitext(path)[1].lower()
    if ext not in SUPPORTED_INPUT:
        sys.exit(f"Unsupported format: {ext}. Supported: {', '.join(SUPPORTED_INPUT)}")

    if ext in {".mp3", ".m4a", ".aiff", ".aif"}:
        try:
            from pydub import AudioSegment
        except ImportError:
            sys.exit("pydub is required for mp3/m4a/aiff: pip install pydub")
        seg = AudioSegment.from_file(path)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            seg.export(tmp_path, format="wav")
            y, sr_orig = sf.read(tmp_path, always_2d=False)
        finally:
            os.unlink(tmp_path)
    else:
        y, sr_orig = sf.read(path, always_2d=False)

    if sr_orig != sr:
        print(f"  Resampling {sr_orig} Hz → {sr} Hz …")
        if y.ndim == 2:
            y = librosa.resample(y.T, orig_sr=sr_orig, target_sr=sr).T
        else:
            y = librosa.resample(y, orig_sr=sr_orig, target_sr=sr)

    return y, sr


def save_audio(path: str, y: np.ndarray, sr: int) -> str:
    """Save audio and return the actual path written."""
    ext = os.path.splitext(path)[1].lower()
    if ext in {".mp3", ".m4a"}:
        print(f"  Note: saving as WAV (lossless).")
        path = os.path.splitext(path)[0] + ".wav"
    sf.write(path, y, sr)
    print(f"  Wrote: {path}  ({len(y)/sr:.2f}s)")
    return path


def write_bpm_sidecar(audio_path: str, bpm: float) -> None:
    """Write <audio_path>.bpm so downstream tools know the exact target BPM."""
    sidecar = audio_path + ".bpm"
    with open(sidecar, "w") as f:
        f.write(f"{bpm}\n")
    print(f"  BPM sidecar: {sidecar}")


# ---------------------------------------------------------------------------
# Beat detection
# ---------------------------------------------------------------------------

def detect_beats_madmom(y_mono: np.ndarray, sr: int) -> np.ndarray:
    import madmom
    from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
    sig = y_mono.astype(np.float32)
    act = RNNBeatProcessor()(sig)
    return np.asarray(DBNBeatTrackingProcessor(fps=100)(act), dtype=float)


def detect_beats_librosa(y_mono: np.ndarray, sr: int) -> tuple[np.ndarray, float]:
    tempo, beat_frames = librosa.beat.beat_track(y=y_mono, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    if len(beat_times) < 2:
        print("  [librosa] beat_track found <2 beats, switching to onset detection …")
        beat_times = librosa.onset.onset_detect(y=y_mono, sr=sr, units="time")
        tempo = _bpm_from_times(beat_times) if len(beat_times) >= 2 else 120.0

    return np.asarray(beat_times, dtype=float), float(np.atleast_1d(tempo)[0])


def detect_beats(y: np.ndarray, sr: int) -> tuple[np.ndarray, float]:
    y_mono = y.mean(axis=1) if y.ndim == 2 else y

    try:
        beat_times = detect_beats_madmom(y_mono, sr)
        bpm = _bpm_from_times(beat_times)
        print(f"  [madmom] {len(beat_times)} beats  |  {bpm:.2f} BPM")
        return beat_times, bpm
    except Exception as e:
        print(f"  [madmom] not available ({e}), falling back to librosa …")

    beat_times, bpm = detect_beats_librosa(y_mono, sr)
    print(f"  [librosa] {len(beat_times)} beats  |  {bpm:.2f} BPM")
    return beat_times, bpm


def _bpm_from_times(beat_times: np.ndarray) -> float:
    if len(beat_times) < 2:
        return 120.0
    return float(60.0 / np.median(np.diff(beat_times)))


# ---------------------------------------------------------------------------
# Beat stabilisation (warping)
# ---------------------------------------------------------------------------

def build_timemap(beat_samples: np.ndarray, target_samples: np.ndarray, n_total: int) -> np.ndarray:
    pairs: list[tuple[int, int]] = []

    if beat_samples[0] > 0:
        pairs.append((0, 0))

    for s, t in zip(beat_samples.tolist(), target_samples.tolist()):
        pairs.append((int(s), int(t)))

    last_src, last_tgt = pairs[-1]
    pairs.append((int(n_total), int(last_tgt + (n_total - last_src))))

    clean: list[tuple[int, int]] = [pairs[0]]
    for s, t in pairs[1:]:
        if s > clean[-1][0] and t > clean[-1][1]:
            clean.append((s, t))

    return np.array(clean, dtype=np.int32)


def stabilize(y: np.ndarray, sr: int, beat_times: np.ndarray, target_bpm: float, strength: float = 1.0) -> np.ndarray:
    beat_interval_samples = sr * 60.0 / target_bpm
    beat_samples = np.round(beat_times * sr).astype(np.int64)

    first = int(beat_samples[0])
    ideal_samples = np.array(
        [first + round(i * beat_interval_samples) for i in range(len(beat_samples))],
        dtype=np.int64,
    )
    target_samples = np.round(
        (1.0 - strength) * beat_samples + strength * ideal_samples
    ).astype(np.int64)

    n_total = len(y) if y.ndim == 1 else y.shape[0]
    timemap = build_timemap(beat_samples, target_samples, n_total)

    print(f"  Warping {len(timemap)-2} beat anchors …")
    return pyrb.timemap_stretch(y, sr, timemap)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Stabilise audio to a consistent BPM grid.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 beat_stabilizer.py -i live_drums.wav -o stable_drums.wav
  python3 beat_stabilizer.py -i guitar.mp3 -o guitar_stable.wav --bpm 98 --strength 0.8
  python3 beat_stabilizer.py -i song.m4a --detect-only
        """,
    )
    p.add_argument("-i", "--input",       required=True)
    p.add_argument("-o", "--output",      default=None,  help="Output WAV file")
    p.add_argument("--bpm",               type=float,    default=None, help="Target BPM (auto-detected if omitted)")
    p.add_argument("--strength",          type=float,    default=1.0,  metavar="0-1", help="Quantisation strength (default 1.0)")
    p.add_argument("--sample-rate",       type=int,      default=44100)
    p.add_argument("--detect-only",       action="store_true", help="Print detected BPM and exit without writing")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    if not os.path.isfile(args.input):
        sys.exit(f"File not found: {args.input}")
    if not args.detect_only and args.output is None:
        sys.exit("Specify -o / --output (or use --detect-only).")
    if not 0.0 <= args.strength <= 1.0:
        sys.exit("--strength must be between 0.0 and 1.0")

    print(f"\n[1/4] Loading  {args.input} …")
    y, sr = load_audio(args.input, args.sample_rate)
    duration = (len(y) if y.ndim == 1 else y.shape[0]) / sr
    channels = 1 if y.ndim == 1 else y.shape[1]
    print(f"  {duration:.2f}s  |  {sr} Hz  |  {channels}ch")

    print("\n[2/4] Detecting beats …")
    beat_times, detected_bpm = detect_beats(y, sr)

    if args.detect_only:
        print(f"\nDetected BPM : {detected_bpm:.3f}")
        print(f"Beat count   : {len(beat_times)}")
        return

    if args.bpm is not None:
        target_bpm = args.bpm
        print(f"\n[3/4] Using manual BPM: {target_bpm:.2f}")
    else:
        if detected_bpm <= 0 or len(beat_times) < 2:
            sys.exit("Could not detect a valid BPM. Try --bpm <value>.")
        target_bpm = round(detected_bpm)
        print(f"\n[3/4] Auto BPM: {detected_bpm:.2f} → rounded to {target_bpm}")

    print(f"\n[4/4] Stabilising (strength={args.strength}) …")
    y_out = stabilize(y, sr, beat_times, target_bpm, strength=args.strength)

    print(f"\nSaving …")
    saved_path = save_audio(args.output, y_out, sr)
    write_bpm_sidecar(saved_path, target_bpm)
    print("\nDone.")


if __name__ == "__main__":
    main()
