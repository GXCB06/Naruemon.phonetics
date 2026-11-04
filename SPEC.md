# Myna — build spec and handoff

This is the single source of truth for continuing the project in any coding agent (OpenCode, Claude Code, Cursor…).
Read this file first, then `AGENTS.md` (rules), then the code. Background reading: `docs/PLAN.md` (product plan) and
`docs/research-open-source-and-apis.md` (tool and API research with licenses and costs).

Status on 2026-11-04: **Phase 0a is done** (rule engine, recorder, pitch tracking, drawing quiz, lab page, 31 tests).
The next work is **finishing Phase 0a with real recordings**, then **Phase 0b (Azure)**.

---

## 1. Product in one paragraph

Myna is a web app that helps **Thai learners of English** practise **sentence intonation**. A learner reads a sentence aloud or
**draws** its tune over four pitch-level lines. The app checks the tune against the patterns taught in the learner's phonetics
course (levels 1–4; falling 2-3-1, non-final 2-3-2, rising 2-3, tag questions), shows **IPA under every word**, explains mistakes
in **English and Thai**, and tracks **personal progress per skill** across speaking, drawing and listening. The UX follows
Duolingo-style patterns (lesson path, short exercises, XP, streaks) with **original** branding: the mascot is a hill myna (นกขุนทอง).
Practice is private by default; the project started because the author was embarrassed in front of classmates.

- Audience first: the author's class and friends (~50 users). Free tiers everywhere.
- Deploy target: **Vercel**. Database/auth: **Supabase**. Speech scoring: **Azure AI Speech** (from Phase 0b). AI tips: **Claude API**.
- Accent: **American English (en-US)** — Azure's prosody scoring only supports en-US.

---

## 2. The intonation model (source of truth: the course material)

Pitch levels: **1 low, 2 mid (normal), 3 high, 4 extra high**.

Golden rules (apply per **thought group**):
1. A sentence has one or more thought groups (usually split at commas/clauses).
2. One thought group has **one** intonation pattern and **one** peak (rising point).
3. The peak is on the **stressed syllable of the last content (strong-form) word** of the thought group.
4. Every pattern starts at level 2, except the falling tag (3-1).

| Pattern | Used for | Shape |
|---|---|---|
| **2-3-1 falling** | statements, commands, wh-questions, exclamations; only the LAST thought group | start 2 → rise to 3 on the nucleus → fall to 1 |
| **2-3-2 non-final** | earlier clauses of compound/complex/conditional sentences, intro phrases (not lists) | start 2 → 3 on the nucleus → back to 2 |
| **2-3 rising** | yes/no questions, direct address, interjections, lists, choices, unsure tags | start 2 → rise to 3 (or 4) and stay up |
| **Tag, sure** | speaker knows the answer | 2-3-1, then the tag falls **3-1** |
| **Tag, not sure** | speaker is asking | 2-3-1, then the tag rises **2-3** |

Typical Thai-learner problems the feedback must target: monotone / compressed range; falling at the end of yes/no questions;
rising at the end of wh-questions; a tone on every word (many small peaks); dropped final consonants (IPA layer, Phase 0b).

Engineering mapping: 1 level = **4 semitones** relative to the speaker's baseline (= level 2 = median F0 of the utterance).
Continuous level = `2 + semitones / 4`.

---

## 3. Current code (Phase 0a)

Stack: **Next.js 16.4 (App Router, `cacheComponents` on), React 19.3, TypeScript, Tailwind CSS 4, Vitest 5**, `pitchy` 4.1,
`perfect-freehand`. Node 22.18+ required (tools run `.ts` files directly; developed on Node 26).

```bash
npm install
npm run dev            # http://localhost:3000/lab
npm test               # 31 tests
npm run lint && npx tsc --noEmit && npm run build
npm run samples        # regenerate public/samples/*.wav + index.json
npm run pitch:export -- <wav-dir> <out-dir>   # pitch-tracker test, step 1 (see README)
```

### File map

| Path | What it does |
|---|---|
| `src/lib/intonation/types.ts` | All shared types: `Sentence`, `ThoughtGroup`, `Syllable` (with target `levels`), `Contour`, `Layout`, `Check`, `AnalysisResult` |
| `src/lib/intonation/lessons.ts` | 6 test sentences from the course, with per-syllable IPA, stress and target levels |
| `src/lib/intonation/contour.ts` | Sentence layout on a 0..1 axis, target contour, resampling/smoothing helpers, `semitonesToLevel` |
| `src/lib/intonation/engine.ts` | **Rule engine** `analyze(sentence, contour, opts)`: features + checks + DTW shape score + overall score. `THRESHOLDS`, `SCORE_CAP` |
| `src/lib/intonation/dtw.ts` | Banded DTW (mean absolute cost) |
| `src/lib/intonation/drawing.ts` | Chart geometry (`CHART`, `levelToY`, `yToLevel`), `strokesToContour` |
| `src/lib/audio/recorder.ts` | `MicRecorder` (AudioWorklet, native sample rate, AEC/NS/AGC off, fallback via `applyConstraints`), `decodeAudioFile` |
| `public/worklets/recorder-processor.js` | AudioWorklet that posts 2048-sample Float32 chunks |
| `src/lib/audio/pitch.ts` | `trackPitch` (pitchy MPM, 40 ms window, 10 ms hop, clarity + loudness gate, octave repair, median filter, short-run removal), `toLevelContour`, `makeLivePitch` |
| `src/lib/audio/resample.ts` | Windowed-sinc resampler (48 → 16 kHz for Azure) |
| `src/lib/audio/wav.ts` | WAV encode (16-bit PCM) / decode (8/16/24/32-bit, float) — Node + browser |
| `src/lib/audio/quality.ts` | `assessQuality` (too quiet, clipping, noisy room, SNR), `trimSilence` |
| `src/lib/audio/analyzeVoice.ts` | Voice pipeline: trim → quality → pitch → levels → `analyze` → playback WAV + 16 kHz WAV |
| `src/lib/synth/voice.ts` | Synthetic "robot voice" following target levels + `ERROR_STYLES` (flat, wrongEnding, everyWordTone) for tests/demos |
| `src/components/lab/*` | Lab UI: `Lab`, `SentenceView` (IPA under words), `ContourChart` (SVG level chart), `DrawingPad`, `VoicePanel`, `ResultPanel` |
| `src/app/lab/page.tsx` | `/lab` route |
| `tools/make-samples.ts` | Writes 30 synthetic WAVs (correct + error variants) |
| `tools/pitch-compare/` | `export-pitchy.ts` + `compare.py` (pitchy vs SwiftF0 vs Praat) |
| `src/lib/**/*.test.ts` | Vitest suites (engine, audio pipeline end to end) |

### How the rule engine decides (per thought group)

| Check | Rule (levels; 1 level = 4 st) |
|---|---|
| `start` | start level within 0.5 of the target's start (pass), within 0.85 (warn) |
| `singlePeak` | prominent interior peaks (prominence ≥ 0.5) ≤ 1 (≤ 0 for the 3-1 tag) |
| `peakPlacement` | halfway point of the main rise lies in the nucleus syllable (tolerance 0.3 syllable before). 3-1: highest point in the nucleus. **Skipped for voice until Phase 0b** |
| `ending` | 2-3-1/3-1: end ≤ 1.5 and fell ≥ 1.0 from the peak. 2-3-2: end in (1.5, 2.6]. 2-3: end ≥ 2.5 and not falling. Specific bilingual messages for "went UP", "went DOWN", "dropped to 1" |
| `range` | p95 − p5 ≥ 0.8 (pass), ≥ 0.45 (warn), else "monotone" |
| `break` (sentence) | voice only: a ≥ 120 ms pause found between thought groups |

Score = 60% checks (ending weighted ×2, warn = ½) + 40% DTW shape similarity. A failed ending caps the score at 50; a failed
range at 55. All numbers are **first guesses** — calibrate them with real recordings (Phase 0a task A2).

Voice in Phase 0a has no syllable timestamps, so each thought group's voiced segment is **linearly stretched** onto the target
span; thought groups are split at the longest pauses (fallback: even split + pause warning).

---

## 4. Rules for agents working on this repo

1. **Next.js 16 is newer than most training data.** Read `node_modules/next/dist/docs/` before using a Next API. `cacheComponents`
   and `partialPrefetching` are enabled in `next.config.ts`.
2. **Imports inside `src/lib/**` use explicit `.ts` extensions** (`import { x } from "./contour.ts"`) and only *erasable* TypeScript
   (no enums, namespaces or parameter properties), so Node can run `tools/*.ts` directly. Components may import `@/lib/...`
   without extensions. `allowImportingTsExtensions` is on in `tsconfig.json`.
3. **Keep the rule engine pure** (no DOM, no React) so it runs in Vitest, Node tools, the browser and later a Web Worker.
4. **Every user-facing feedback string is bilingual**: `{ en, th }`. Thai should be simple and natural (the target users are Thai
   university students).
5. **Tests are required** for engine/audio changes. Use `synthesizeSentence` + `ERROR_STYLES` to build end-to-end cases.
   Run `npm test && npm run lint && npx tsc --noEmit && npm run build` before finishing a task.
6. **Licenses** — never ship in the browser bundle or app code: essentia.js (AGPL), pitchfinder (GPL), espeak-ng/phonemizer.js
   (GPL), Allosaurus (GPL), Peaks.js (LGPL), tldraw (license key), any unlicensed repo's code, CC-BY-NC models (MMS aligner,
   ZIPA "-ns", F5-TTS, XTTS-v2). GPL tools (Parselmouth/Praat, espeak-ng) are OK only in **local/build scripts**.
7. **No Duolingo assets or branding**: no owl, no Duolingo name/green/fonts/sounds/illustrations (e.g. the mascot and sounds in
   `sanidhyy/duolingo-clone`). Patterns only. Our palette: paper `#fffbf2`, ink `#1e1b2e`, myna yellow `#f2b705`, teal `#2c6e63`
   (tokens in `src/app/globals.css`, dark mode included).
8. **Audio rules**: AudioContext at the device's **native** rate (never request 16 kHz — Firefox throws); keep AEC/NS/AGC off;
   create/resume the AudioContext inside the user's tap (iOS); handle `NotAllowedError` with a "reload to fix the mic" message.
9. **Privacy**: don't store audio by default. Voice is personal data under Thailand's PDPA — any storage needs explicit opt-in.
10. **Secrets** never reach the browser (Azure key, Anthropic key, Supabase service key). Use route handlers.
11. Don't commit `.env*`. Document new env vars in `.env.example`.

---

## 5. Roadmap and task specs

Each task lists **what to build** and **done when** (acceptance criteria). Do them in order unless noted.

### Phase 0a — finish (needs real recordings)

- **A1. Collect a test set.** 20–50 takes of the 6 lab sentences: the author, classmates (with consent), and native/TTS
  references. Use the lab's "Download 16 kHz WAV". Name files `<sentenceId>--<speaker>--<take>.wav`; keep them **out of git**
  (add `recordings/` to `.gitignore`).
  *Done when* the folder exists with ≥ 20 files covering all 6 sentences and ≥ 3 speakers.
- **A2. Pitch-tracker test + calibration.** Run `tools/pitch-compare` (see README). If pitchy's "final direction agrees with Praat"
  is clearly below SwiftF0's, add SwiftF0 in the browser via `onnxruntime-web` for final scoring (keep pitchy for the live line).
  Then tune `THRESHOLDS` / `SCORE_CAP` / `SEMITONES_PER_LEVEL` so correct takes pass and the author's "Thai-style" takes fail
  the right check. Add a test per real failure you fix (synthetic reproduction is fine).
  *Done when* ≥ 90% of correct takes score ≥ 80 and every deliberate error take fails the intended check.
- **A3. Move voice analysis to a Web Worker** (`analyzeVoice` is pure) so long takes don't block the UI.

### Phase 0b — Azure alignment, IPA, TTS references

Env: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (try `southeastasia`; confirm prosody support there, else `eastus`).
Free tier F0: 5 audio hours/month STT + 0.5M chars/month TTS. The author still needs an Azure account
(Azure for Students: US$100 credit, no card, school email).

- **B1. Token route.** `src/app/api/speech-token/route.ts` (POST): exchange the key at
  `https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken` (header `Ocp-Apim-Subscription-Key`), return
  `{ token, region }`. Tokens last 10 minutes — cache ~9 min server-side. Add a simple per-IP rate limit.
  *Done when* the browser gets a token and the key never appears in client bundles/network responses.
- **B2. Pronunciation assessment in the browser** (`microsoft-cognitiveservices-speech-sdk`), new module
  `src/lib/azure/assess.ts`:
  - `SpeechConfig.fromAuthorizationToken(token, region)`, `speechRecognitionLanguage = "en-US"`.
  - Audio: push stream with `AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)`; write the PCM16 from `analyzeVoice().wav16k`
    (skip the 44-byte header) and close the stream.
  - `PronunciationAssessmentConfig.fromJSON({ referenceText, gradingSystem: "HundredMark", granularity: "Phoneme",
    phonemeAlphabet: "IPA", nBestPhonemeCount: 5, enableMiscue: true })`, enable prosody assessment, `applyTo(recognizer)`,
    `recognizeOnceAsync`, read the JSON result property. (Verify exact SDK names against Microsoft's current docs.)
  - Parse into `AzureAssessment { words: { word, offsetSec, durationSec, accuracy, errorType, syllables: { ipa, offsetSec, durationSec, accuracy }[], phonemes: { ipa, accuracy, nbest: { ipa, score }[] }[] }[], prosodyScore, monotone, breaks }`.
    Offsets/durations are in 100-ns ticks → seconds.
  *Done when* a recorded take returns words + syllables + phonemes with timestamps for all 6 sentences.
- **B3. Real alignment in the engine.** Map Azure syllable timestamps onto our layout slots (piecewise-linear time warp per
  syllable, replacing the per-group linear stretch) and call `analyze(..., { timingKnown: true })` so `peakPlacement` runs for
  voice. Handle Azure syllabification differing from ours (match by word, then distribute). Use Azure's pause between words to
  validate the `break` check.
  *Done when* a take with the rise on the wrong word gets a `peakPlacement` fail naming that syllable.
- **B4. IPA layer.** Show per-phoneme accuracy colours under each word; tap a word → expected vs spoken IPA (best `nbest`).
  Add a Thai-specific rule: flag dropped final consonants (expected final consonant with very low accuracy/missing).
  **Map Azure IPA symbols and our lesson IPA to one symbol set** (e.g. Azure `ɹ`/`r`, `ɝ`/`ɚ`) so learners don't see false errors.
- **B5. Lesson IPA build script** `tools/build-ipa.ts`: `cmu-pronouncing-dictionary` (ISC) → own maximal-onset syllabifier →
  ARPAbet→IPA map → stress marks → write syllables/IPA into lesson JSON; manual override field for tricky words ("happy").
  Fallback for missing words: `g2p_en` (Apache-2.0) in a Python script, or espeak-ng **in the build script only**.
  *Done when* the 6 lessons' IPA is generated (not hand-typed) and matches the current hand-written IPA or a documented fix.
- **B6. Reference audio** `tools/make-tts.ts`: Azure Neural TTS, **non-HD** en-US voices (HD voices ignore `<prosody>`), one
  female + one male; SSML `<prosody contour>` over the whole sentence (contours don't work on short phrases like tags).
  Run every clip through our own pipeline; only keep clips that pass their own pattern; otherwise regenerate with adjusted
  contour or flag for a human recording. Save to `public/audio/<sentenceId>--<voice>.mp3`.
  *Done when* every lesson has two passing reference clips and the lab can play them.
- (Optional) **B7.** 14-day Speechace trial as a second opinion on rise/fall for tag questions. Not a replacement (ARPAbet only).

### Phase 1 — MVP (one unit end to end)

- **C1. Supabase** project + auth (Google + email magic link). Tables (SQL in §7). Row-level security: users only read/write
  their own rows. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (server-only service key if needed).
- **C2. Content model.** Move lessons to `content/units/<unit>/<lesson>.json` (same `Sentence` type + exercise list).
  Unit 2 = Falling 2-3-1 with ~12 sentences from the course PDFs (statements, negatives, commands, wh-questions, exclamations).
- **C3. Lesson player** (`/learn/[unit]/[lesson]`): progress bar, big CHECK button, bottom feedback sheet (green "Nice!" /
  amber "Almost"), 8–12 exercises. Exercise types for the MVP: **Hear it** (pick rising vs falling clip), **Find the peak**
  (tap the nucleus syllable), **Draw it** (DrawingPad), **Shadow it** (listen, record, results). Listening-first order.
- **C4. Home path** (`/`): winding path of lesson nodes (only Unit 2 unlocked), XP total, streak flame.
- **C5. Save attempts** (`attempts` table) with `modality`, `levels`, `checks`, scores. No audio.
  *Done when* a classmate finishes a lesson on a phone and their attempts appear in Supabase.

### Phase 2 — full course + personal analytics

- **D1. All units:** 1 Hearing levels · 2 Falling 2-3-1 · 3 Rising 2-3 · 4 Lists & choices · 5 Non-final 2-3-2 · 6 Tag questions
  · 7 Mixed review. ~80 sentences from the course PDFs.
- **D2. Skill mastery.** After each attempt, update `skill_mastery` (pattern × sub-skill × modality; sub-skills = the check ids
  + `listening`) with an EWMA score 0–100 and attempt count; "not enough data" under 5 attempts.
- **D3. Drawing vs speaking insight** (the key personal feature): high draw/low speak → "train your voice"; low draw/high speak →
  "learn the rule"; both low → review unit; both high → mastered.
- **D4. My Progress page:** skill heat map, radar per pattern, top 3 to improve with **Practice this** (5-minute review lesson
  built from weak skills, scheduled with **ts-fsrs**), trend lines (pitch range in semitones, peak accuracy, Azure prosody).
- **D5. XP, daily goal, streak** in Supabase (no gamification library — none are maintained). Speaking never costs hearts.

### Phase 3 — polish

- **E1. Claude tips** `src/app/api/feedback/route.ts`: input = findings JSON (numbers only, **never audio**); output = 1–2 sentence
  tip in English + Thai. Model `claude-opus-5-5`, low effort, `@anthropic-ai/sdk`. Cache by findings signature. Weekly summary
  (cached per user per week in `weekly_summaries`). Env: `ANTHROPIC_API_KEY`.
- **E2.** Myna mascot (Rive or Lottie; original art), sounds (`use-sound`), confetti, before/after recordings (opt-in storage in
  Supabase Storage with RLS), mic-check screen (noise floor, level meter, Bluetooth warning), onboarding, PWA manifest.
- **E3.** Usability test with 5–10 classmates; fix the top issues.

### Phase 4 — extras

Teacher mode (paste a sentence → auto IPA + choose nucleus/pattern → assign to a class code), opt-in class dashboard,
LINE Login.

---

## 6. Environment variables (`.env.local`, document in `.env.example`)

| Name | Phase | Where used |
|---|---|---|
| `AZURE_SPEECH_KEY` | 0b | server only (token route, TTS script) |
| `AZURE_SPEECH_REGION` | 0b | server + returned with the token |
| `NEXT_PUBLIC_SUPABASE_URL` | 1 | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1 | client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | 1 (only if needed) | server only |
| `ANTHROPIC_API_KEY` | 3 | server only |

---

## 7. Database schema (Supabase, Phase 1–2)

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  ui_lang text not null default 'th',          -- 'th' | 'en'
  daily_goal_xp int not null default 30,
  streak_count int not null default 0,
  streak_last_day date,
  audio_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  sentence_id text not null,
  modality text not null check (modality in ('speak','draw','listen')),
  pattern text not null,
  levels jsonb,                 -- per-syllable [start,end] levels when timing is known
  checks jsonb not null,        -- [{ id, status }] per thought group
  shape_score int,
  overall int not null,
  azure_accuracy real,
  azure_prosody real,
  phoneme_errors jsonb,
  created_at timestamptz not null default now()
);

create table skill_mastery (
  user_id uuid not null references auth.users on delete cascade,
  pattern text not null,
  skill text not null,          -- start | singlePeak | peakPlacement | ending | range | break | listening | pronunciation
  modality text not null,       -- speak | draw | listen
  score real not null default 0,
  attempts_n int not null default 0,
  last_seen timestamptz,
  next_review_at timestamptz,   -- ts-fsrs
  primary key (user_id, pattern, skill, modality)
);

create table lesson_progress (
  user_id uuid not null references auth.users on delete cascade,
  lesson_id text not null,
  stars int not null default 0,
  best_score int not null default 0,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

create table xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  amount int not null,
  source text not null,
  created_at timestamptz not null default now()
);

create table weekly_summaries (
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  text_en text not null,
  text_th text not null,
  stats jsonb not null,
  primary key (user_id, week_start)
);

-- RLS: every table is private to its owner
alter table profiles enable row level security;
alter table attempts enable row level security;
alter table skill_mastery enable row level security;
alter table lesson_progress enable row level security;
alter table xp_events enable row level security;
alter table weekly_summaries enable row level security;
create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own attempts" on attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own mastery" on skill_mastery for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own progress" on lesson_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own xp" on xp_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own summaries" on weekly_summaries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## 8. Deployment (Vercel)

- Import the repo in Vercel (framework: Next.js). Set env vars per §6 for Production and Preview.
- Hobby plan is fine for a non-commercial class project. Audio goes browser → Azure directly (token flow), so Vercel's 4.5 MB
  request-body limit never applies.
- The AudioWorklet is served from `/worklets/recorder-processor.js` (static). HTTPS is required for the microphone (Vercel gives it).

---

## 9. Open questions and risks

- Thresholds are uncalibrated until A2. pitchy has no voicing model; creaky voice at phrase ends can flip "falling".
- iOS Safari: `echoCancellation:false` also disables AGC (no separate switch); iOS 26 can get stuck on `NotAllowedError`;
  Bluetooth headset mics drop to narrowband — test on real iPhones early.
- Azure: prosody is en-US only and returns no rise/fall direction (only a score + Monotone flag); confirm the free tier covers the
  pronunciation/prosody add-on; confirm the region.
- TTS contours may be flatter than a teacher's — every reference clip must pass its own pattern check.
- Some sentences allow more than one correct reading (emphasis, tags) — lessons may need an `alternatives` list.
- No Thai-L1 English corpus exists; classmates' recordings (with consent) become the test set.
