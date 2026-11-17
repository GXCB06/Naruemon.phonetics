# Melobi — intonation coach

> Continuing the build in another coding agent? Start with **[SPEC.md](SPEC.md)** (handoff, roadmap, acceptance criteria).

Melobi helps **Thai learners of English** practise sentence intonation. Learners **say** or **draw** a sentence's tune,
and one rule engine grades both against the textbook pattern (levels 1–4; falling 2-3-1, non-final 2-3-2, rising 2-3,
tag questions). It shows IPA under every word, explains mistakes in English and Thai, and tracks progress per skill
across speaking, drawing and listening.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 648 unit tests
npm run lint && npx tsc --noEmit && npm run build
npm run samples    # regenerate the synthetic test recordings in public/samples
```

Environment variables live in `.env.local` (see `.env.example`): Supabase URL/anon key, `AZURE_SPEECH_KEY` /
`AZURE_SPEECH_REGION`, and a Gemini or Anthropic key for Ask Myna. Everything except sign-in, Azure scoring and the AI
tip works without any of them.

## What's in the app

| Piece | Where |
|---|---|
| Rule engine (start level, one peak, peak on the stressed syllable, ending, range, pause) | `src/lib/intonation/engine.ts` |
| Course path and 13 lessons (falling, rising, lists, non-final, tags, mixed review) | `src/lib/course/units.ts`, `content/units/` |
| Lesson player: Hear it, Find the peak, Draw it, Shadow it, Match pairs, Build the tune, Meaning match | `src/components/learn/` |
| Speak screen with live pitch and best-score tracking | `src/components/speak/`, `/lab` |
| Mic recorder (AudioWorklet, native rate, browser voice processing off) | `src/lib/audio/recorder.ts`, `public/worklets/recorder-processor.js` |
| Pitch tracking (pitchy + octave repair, median filter, voicing gate) | `src/lib/audio/pitch.ts` |
| Recording quality checks (too quiet, clipping, noisy room) | `src/lib/audio/quality.ts` |
| Azure token route, pronunciation assessment, syllable alignment, IPA layer | `src/app/api/speech-token/`, `src/lib/azure/` |
| Optional Azure check in Shadow it and the Speak screen | `src/components/azure/PronunciationCheck.tsx` |
| Supabase auth, attempt sync, skill mastery, progress screen | `src/lib/attempts/`, `src/lib/progress/`, `supabase/migrations/` |
| PWA manifest, service worker and install prompt | `src/app/manifest.ts`, `public/sw.js`, `src/components/pwa/` |
| CI (test, lint, type-check, build) | `.github/workflows/ci.yml` |

Azure's extra check is **optional**: the learner taps a button, the take is sent once, and the app shows accuracy,
prosody, the IPA layer and a peak-position check timed by Azure. Without `AZURE_SPEECH_KEY` the button explains that it
is off and everything else keeps working.

## Known limits

- Thresholds are still first guesses. Real-recording calibration (20–50 takes) and the pitch-tracker bake-off have not
  been run; `recordings/` currently holds only handwriting samples.
- Voice analysis runs on the main thread (moving it to a Web Worker is task A3).
- XP, streaks and lesson progress are device-local; the Supabase `profiles`, `xp_events` and `weekly_summaries` tables are
  not wired yet, and there is no AI weekly summary or spaced repetition.
- “Hearing the 4 levels” (the first unit of the full course) is not built.

## Pitch-tracker test (pitchy vs SwiftF0 vs Praat)

Collect 20–50 real recordings (download the 16 kHz WAV from the lab page after each take), put them in one folder, then:

```bash
python -m venv C:/venvs/myna-pitch
C:/venvs/myna-pitch/Scripts/python -m pip install -r tools/pitch-compare/requirements.txt
npm run pitch:export -- path/to/wavs path/to/out
C:/venvs/myna-pitch/Scripts/python tools/pitch-compare/compare.py path/to/wavs path/to/out
```

It prints voicing agreement, gross pitch errors, median cents error and — most important — whether each tracker agrees
with Praat on the **final rise/fall**. Praat (Parselmouth) is GPL: keep it as a local tool, never in the web app.

On the synthetic samples both trackers match Praat closely (median error ≈1–2 cents, final direction agrees on 29 of 30
files). Synthetic audio is easy; real voices are the real test.
