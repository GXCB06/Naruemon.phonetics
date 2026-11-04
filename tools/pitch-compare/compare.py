"""Phase 0a pitch-tracker test: pitchy (our browser pipeline) vs SwiftF0 vs Praat.

Praat (via Parselmouth) is the reference. For every WAV we report, per tracker:
  - voicing agreement with Praat (% of frames where both agree voiced/unvoiced)
  - gross pitch error (GPE): % of jointly voiced frames more than 20% away from Praat
  - median absolute error in cents on jointly voiced frames
  - final-direction agreement: does the last 300 ms rise/fall the same way as Praat?
    (this is the number that matters most: it decides "rising" vs "falling")

Usage (from the myna folder):
  python -m venv C:/venvs/myna-pitch          # keep the venv path short on Windows (260-char path limit)
  C:/venvs/myna-pitch/Scripts/python -m pip install -r tools/pitch-compare/requirements.txt
  npm run pitch:export -- <wav-folder> <out-folder>
  C:/venvs/myna-pitch/Scripts/python tools/pitch-compare/compare.py <wav-folder> <out-folder>

Parselmouth is GPL-3.0: fine as a local dev tool, never ship it in the web app.
"""

from __future__ import annotations

import csv
import math
import sys
from pathlib import Path

import numpy as np
import parselmouth

try:
    from swift_f0 import SwiftF0  # MIT, ONNX
except Exception:  # pragma: no cover - optional
    SwiftF0 = None

HOP = 0.01
FMIN, FMAX = 70.0, 500.0


def praat_track(path: Path) -> tuple[np.ndarray, np.ndarray]:
    snd = parselmouth.Sound(str(path))
    pitch = snd.to_pitch_ac(time_step=HOP, pitch_floor=FMIN, pitch_ceiling=FMAX)
    t = pitch.xs()
    f = pitch.selected_array["frequency"]
    f = np.where(f > 0, f, np.nan)
    return t, f


def swift_track(path: Path) -> tuple[np.ndarray, np.ndarray] | None:
    if SwiftF0 is None:
        return None
    snd = parselmouth.Sound(str(path))  # reuse Praat's reader (no soundfile dependency)
    audio = snd.values.mean(axis=0)
    res = SwiftF0().detect(audio, snd.sampling_frequency, fmin=FMIN, fmax=FMAX)
    # confidence is calibrated so that >= 0.5 means voiced; also drop near-silent frames
    voiced = (res.confidence >= 0.5) & (res.loudness_db > np.max(res.loudness_db) - 30)
    f = np.where(voiced, res.pitch_hz, np.nan)
    return res.timestamps, f


def pitchy_track(csv_path: Path) -> tuple[np.ndarray, np.ndarray]:
    t, f = [], []
    with open(csv_path, newline="") as fh:
        for row in csv.DictReader(fh):
            t.append(float(row["time"]))
            f.append(float(row["hz"]) if row["hz"] else np.nan)
    return np.array(t), np.array(f)


def on_grid(t: np.ndarray, f: np.ndarray, grid: np.ndarray) -> np.ndarray:
    """Nearest-frame lookup onto a common time grid (keeps NaN = unvoiced)."""
    idx = np.clip(np.searchsorted(t, grid), 0, len(t) - 1)
    prev = np.clip(idx - 1, 0, len(t) - 1)
    use_prev = np.abs(t[prev] - grid) < np.abs(t[idx] - grid)
    idx = np.where(use_prev, prev, idx)
    out = f[idx].copy()
    out[np.abs(t[idx] - grid) > HOP] = np.nan
    return out


def final_direction(f: np.ndarray) -> int:
    """+1 rising, -1 falling, 0 level, over the last 300 ms of voicing (in semitones)."""
    voiced = np.where(~np.isnan(f))[0]
    if len(voiced) < 10:
        return 0
    end = voiced[-1]
    seg = f[max(0, end - int(0.3 / HOP)) : end + 1]
    seg = seg[~np.isnan(seg)]
    if len(seg) < 6:
        return 0
    st = 12 * np.log2(seg / np.median(seg))
    third = max(2, len(st) // 3)
    delta = np.mean(st[-third:]) - np.mean(st[:third])
    return 1 if delta > 1.0 else -1 if delta < -1.0 else 0


def metrics(ref: np.ndarray, est: np.ndarray) -> dict[str, float]:
    rv, ev = ~np.isnan(ref), ~np.isnan(est)
    both = rv & ev
    voicing = float(np.mean(rv == ev)) * 100
    if both.sum() == 0:
        return {"voicing%": voicing, "GPE%": math.nan, "cents": math.nan}
    ratio = est[both] / ref[both]
    gpe = float(np.mean(np.abs(ratio - 1) > 0.2)) * 100
    cents = float(np.median(np.abs(1200 * np.log2(ratio))))
    return {"voicing%": voicing, "GPE%": gpe, "cents": cents}


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    wav_dir, csv_dir = Path(sys.argv[1]), Path(sys.argv[2])
    rows = []
    for wav in sorted(wav_dir.glob("*.wav")):
        t_ref, f_ref = praat_track(wav)
        grid = np.arange(t_ref[0], t_ref[-1], HOP)
        ref = on_grid(t_ref, f_ref, grid)
        ref_dir = final_direction(ref)
        trackers: dict[str, np.ndarray] = {}
        pcsv = csv_dir / f"{wav.stem}.pitchy.csv"
        if pcsv.exists():
            trackers["pitchy"] = on_grid(*pitchy_track(pcsv), grid)
        sw = swift_track(wav)
        if sw is not None:
            trackers["swiftf0"] = on_grid(*sw, grid)
        for name, est in trackers.items():
            m = metrics(ref, est)
            m["direction_ok"] = float(final_direction(est) == ref_dir)
            rows.append({"file": wav.name, "tracker": name, **m})

    if not rows:
        print("No results. Did you run export-pitchy.ts first, and install swift-f0?")
        return
    out = csv_dir / "pitch-compare.csv"
    with open(out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    print(f"{'tracker':<10} {'files':>5} {'voicing%':>9} {'GPE%':>7} {'cents':>7} {'final dir ok':>13}")
    for name in sorted({r["tracker"] for r in rows}):
        rs = [r for r in rows if r["tracker"] == name]
        avg = lambda k: np.nanmean([r[k] for r in rs])  # noqa: E731
        print(
            f"{name:<10} {len(rs):>5} {avg('voicing%'):>9.1f} {avg('GPE%'):>7.1f} "
            f"{avg('cents'):>7.1f} {100 * avg('direction_ok'):>12.0f}%"
        )
    print(f"\nPer-file results: {out}")


if __name__ == "__main__":
    main()
