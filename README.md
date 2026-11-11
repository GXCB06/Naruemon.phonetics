# Melobi — intonation coach (Phase 0a)

> Continuing the build in another coding agent? Start with **[SPEC.md](SPEC.md)** (handoff, roadmap, acceptance criteria).

A test bed for the intonation engine. Learners **say** or **draw** a sentence's tune, and one rule engine grades both against the textbook pattern (levels 1–4; falling 2-3-1, non-final 2-3-2, rising 2-3, tag questions).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000/lab
npm test           # 31 unit tests: rule engine, pitch tracking, resampling, WAV, quality checks
npm run samples    # regenerate the synthetic test recordings in public/samples
```

## What's in Phase 0a

| Piece | Where |
|---|---|
| Rule engine (start level, one peak, peak on the stressed syllable, ending, range, pause) | `src/lib/intonation/engine.ts` |
| Test sentences from the course material, with IPA and target levels | `src/lib/intonation/lessons.ts` |
| Drawing → contour, chart geometry | `src/lib/intonation/drawing.ts` |
| Mic recorder (AudioWorklet, native rate, browser voice processing off) | `src/lib/audio/recorder.ts`, `public/worklets/recorder-processor.js` |
| Pitch tracking (pitchy + octave repair, median filter, voicing gate) | `src/lib/audio/pitch.ts` |
| 48→16 kHz resampler and WAV encoder (Azure format, for Phase 0b) | `src/lib/audio/resample.ts`, `src/lib/audio/wav.ts` |
| Recording quality checks (too quiet, clipping, noisy room) | `src/lib/audio/quality.ts` |
| Synthetic "robot voice" for tests and demo samples | `src/lib/synth/voice.ts`, `tools/make-samples.ts` |
| Lab page | `src/app/lab/page.tsx`, `src/components/lab/*` |

Known limits until Phase 0b (Azure): for **voice**, the "peak position" check is skipped and time is stretched per thought group, because we don't have syllable timestamps yet. Thought groups in speech are split at the longest pauses. All thresholds live in `THRESHOLDS` / `SCORE_CAP` in `engine.ts` and are first guesses.

## Pitch-tracker test (pitchy vs SwiftF0 vs Praat)

Collect 20–50 real recordings (download the 16 kHz WAV from the lab page after each take), put them in one folder, then:

```bash
python -m venv C:/venvs/myna-pitch
C:/venvs/myna-pitch/Scripts/python -m pip install -r tools/pitch-compare/requirements.txt
npm run pitch:export -- path/to/wavs path/to/out
C:/venvs/myna-pitch/Scripts/python tools/pitch-compare/compare.py path/to/wavs path/to/out
```

It prints voicing agreement, gross pitch errors, median cents error and — most important — whether each tracker agrees with Praat on the **final rise/fall**. Praat (Parselmouth) is GPL: keep it as a local tool, never in the web app.

On the synthetic samples both trackers match Praat closely (median error ≈1–2 cents, final direction agrees on 29 of 30 files). Synthetic audio is easy; real voices are the real test.
