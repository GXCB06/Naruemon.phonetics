# Intonation Coach for Thai learners of English: build plan

Working name: **"Melobi"** (นกขุนทอง, the hill myna: a bird famous for copying human speech, and a natural mascot).
Target: a web app on Vercel that records a learner saying a sentence, analyses its intonation against
the patterns taught in class, and shows IPA under every word. Gamified UX in the style of Duolingo, with original art and branding.

---

## 1. What the course material asks for

Both PDFs teach the same model. Every rule in it can be checked automatically, so the app is built around them.

| Course rule | What the app checks |
|---|---|
| 4 pitch levels: 1 low, 2 mid, 3 high, 4 extra high | Convert the learner's pitch into levels 1–4 *relative to their own voice* |
| One thought group has one intonation pattern and one peak | Count peaks per thought group. More than one peak means "word-by-word tones", the usual Thai L1 transfer |
| The peak is on the stressed syllable of the last strong-form (content) word | Check that the peak's timestamp falls inside the target syllable |
| Every pattern starts at level 2 (except tag questions) | Check the opening level |
| **Falling 2-3-1**: statements, commands, wh-questions, exclamations (last thought group only) | Ending must drop to level 1 |
| **Non-final 2-3-2**: earlier clauses of compound/complex/conditional sentences, introductory phrases | Ending must come back to level 2, not to 1 |
| **Rising 2-3**: yes/no questions, direct address, interjections, lists, choices | Ending must stay high or rise |
| **Tag questions**: sure means 2-3-1 then 3-1; not sure means 2-3-1 then 2-3 | Two thought groups; the tag's ending direction carries the meaning |

The example sentences in both documents become the first lesson content: about 80 sentences, already sorted by pattern.

### Known Thai-learner problems the feedback should target (from research)
- **Monotone / compressed pitch range.** Thai speakers often carry over a narrow L1 pitch range.
- **Falling at the end of yes/no questions.** Thai polar questions end with a particle and a falling tone.
- **Rising at the end of wh-questions.** This is the opposite error.
- **A tone on every word**, giving many small peaks instead of one nucleus.
- (Bonus, from the IPA layer) **dropped final consonants** such as /s/, /t/, /d/, which change both meaning and rhythm.

---

## 2. How the analysis works

```
 Browser                                                     Vercel (Next.js)
 ───────                                                     ────────────────
 mic ─► AudioWorklet (raw PCM, 48 kHz, no AGC/NS)
          │
          ├─► live pitch line while speaking (pitchy)
          │
          └─► on stop:
               1. trim silence, check volume/clipping
               2. Web Worker: full pitch contour (Hz) ─► semitones vs. speaker baseline
               3. resample to 16 kHz mono WAV ─────────────►  /api/speech-token  (hides Azure key,
               4. Azure Pronunciation Assessment  ◄──── token     returns 10-min token)
                  (referenceText, IPA, syllables,
                   word/syllable timestamps, prosody,
                   spoken-phoneme n-best)
               5. ALIGN: pitch contour × syllable timestamps
               6. RULE ENGINE (course rules above) ─► findings JSON
               7. Results screen  ──────────────────────────►  /api/feedback (Claude) ─► friendly EN+TH tip
```

**Why this split:**
- **Azure AI Speech, Pronunciation Assessment** supplies the hard parts: forced alignment (word, syllable and phoneme timestamps), **IPA phonemes** (`phonemeAlphabet: "IPA"`), what the learner *actually* said (`nBestPhonemeCount`), a **prosody score** covering stress, intonation, rate and rhythm, and Monotone/Break error flags. Prosody is **en-US only**, which suits a US-English course.
- Azure does **not** know the 2-3-1 / 2-3-2 / 2-3 patterns. It only gives one overall prosody score and a "monotone" flag. The intonation judgement that matches the class material comes from **our own pitch tracking and rule engine**, which is the project's original contribution.
- Pitch is computed **in the browser**: it is instant, free, needs no upload, and runs on the uncompressed audio.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Vercel's native framework; route handlers act as the API |
| Styling/UI | **Tailwind CSS** + own components, **Motion** (Framer Motion) for bouncy transitions | Lets us build a rounded, chunky, game-like look |
| Mascot animation | **Rive** (or Lottie) | Melobi reacts: happy, thinking, "try again" |
| Sound effects | `use-sound` / Howler | Correct/incorrect chimes and lesson-complete fanfare |
| Fonts | **Nunito** (UI), **IBM Plex Sans Thai** or **Noto Sans Thai** (Thai), **Doulos SIL** or **Noto Sans** (IPA) | IPA glyphs (ʊ ə ˈ ˌ ɹ) need a font that actually has them |
| Recording | **Web Audio API + AudioWorklet** at the device's native rate → own 48→16 kHz downsampler + WAV encoder | Not MediaRecorder (see section 4). Ready-made option: `recorder-audio-worklet` (MIT, 2 KB, active). Avoid RecordRTC, Recorderjs and audio-recorder-polyfill (stale, unlicensed or archived) |
| Pitch detection | **pitchy** (McLeod Pitch Method, 0BSD/MIT, 2.8 KB) for the **live** line; **SwiftF0** (MIT, ONNX, runs in the browser via onnxruntime-web) as the candidate for **final scoring** | Pick the scorer after the Phase 0a test on real recordings. Server fallback: Parselmouth (Praat) in a Vercel Python function. **Do not use** essentia.js (AGPL), pitchfinder (GPL) or aubiojs (abandoned) |
| Voice activity (optional) | `@ricky0123/vad-web` (ISC) | Auto-stop when the learner finishes. ~114 KB plus the ONNX runtime, so only add it if needed |
| Speech scoring + IPA | **Azure AI Speech: Pronunciation Assessment** (`microsoft-cognitiveservices-speech-sdk`) | Prosody enabled, granularity Phoneme, IPA, en-US |
| Model audio | **Azure Neural TTS** with SSML `<prosody contour>`, generated **once at build time** and saved as static files | Use **non-HD** en-US Neural voices only (HD voices ignore `<prosody>`). Contours don't work on short phrases, so apply them to the whole sentence, including tag questions. Every clip must pass our own analyser; clips that fail get pitch-edited with Parselmouth at build time or recorded by a person. Fits the free 0.5M characters/month |
| Contour chart | Custom **SVG** React component | Draws the textbook-style level lines 1–4 under the learner's line |
| Drawing quizzes | **Pointer Events** on an SVG canvas + **perfect-freehand** (MIT) for a smooth stroke | Works with finger, mouse and stylus. Not tldraw (needs a production license key) |
| Waveform + word regions (optional) | **wavesurfer.js** (BSD-3, very active) | Playback with word/syllable regions; the pitch overlay itself stays a custom SVG |
| Live pitch line | Custom canvas/SVG, or **uPlot** (MIT) | Fast real-time line while speaking |
| Analytics charts | Custom SVG or **Recharts** | Skill heat map, radar per pattern, trend lines |
| Spaced repetition | **ts-fsrs** (MIT, active) | Schedules when each weak skill comes back for review |
| AI tutor text | **Claude API** (`@anthropic-ai/sdk`), model `claude-opus-5-5` at low effort | Turns the findings JSON into a 1–2 sentence tip in English + Thai. Templates cover the MVP; cache common results. Claude gets **numbers, never audio**: audio-AI judges are unreliable at hearing intonation |
| Auth + DB | **Supabase** (Postgres + Auth) | Progress, XP, streaks, attempt scores. Google/email login; LINE Login later |
| Lesson content | JSON files in the repo | Version-controlled; authoring script fills in IPA and stress |
| IPA for lessons | Build-time script: `cmu-pronouncing-dictionary` (ISC) → **own maximal-onset syllabifier** (~100 lines) → ARPAbet→IPA map → ˈ/ˌ at the start of the syllable | Shows IPA with stress marks *before* the learner speaks. Lesson JSON has an author override for tricky words ("happy"). Missing words: `g2p_en` (Apache-2.0) or espeak-ng, **build script only** (GPL). Cross-check against `ipa-dict` (MIT). Map Azure's IPA symbols and ours to **one symbol set** so learners don't see false errors |
| PWA | `manifest` + service worker | "Add to Home Screen" on phones |
| Analytics | Vercel Analytics | — |

---

## 4. Audio recording quality (the part that decides whether this works)

Pitch tracking is very sensitive to what the browser does to the mic signal. Recipe:

1. **Turn off browser "voice call" processing:**
   ```ts
   navigator.mediaDevices.getUserMedia({ audio: {
     channelCount: 1,
     echoCancellation: false,
     noiseSuppression: false,   // NS smears pitch and eats quiet syllables
     autoGainControl: false,    // AGC flattens loudness and stress cues
   }})
   ```
   Fall back to defaults if the device rejects the constraints. On Safari, `echoCancellation:false` also turns off auto-gain
   (Safari still has no separate `autoGainControl` switch), so test on real iPhones.
2. **Capture raw PCM with an AudioWorklet**, not `MediaRecorder`. MediaRecorder produces lossy Opus (Chrome) or AAC/MP4 (Safari) in different formats per browser. Raw Float32 frames are identical everywhere and lossless.
3. Create the `AudioContext` at the **default (native) sample rate, usually 48 kHz**, and use that audio for pitch analysis.
   **Don't** request `sampleRate: 16000`: Firefox throws an error when a mic is connected to a non-default-rate context (an open bug).
   Downsample to **16 kHz, 16-bit mono WAV** yourself, only for Azure. A small low-pass + decimate function is enough; skip libsamplerate-js (1.46 MB).
4. **Mic check screen** before the first lesson (and when results look bad):
   - Measure the room noise floor for 1 s. Above about −50 dBFS: "Find a quieter place."
   - Live level meter while speaking. Warn on clipping (samples near ±1.0) and on too-quiet input.
   - **Warn against Bluetooth headset mics.** In call mode (HFP) they drop to 8–16 kHz narrowband audio. Wired earbuds or the phone's built-in mic work better.
5. **Trim silence** with a simple energy VAD and keep about 200 ms of padding. Cap each take at about 12 s (Azure's single-shot limit is 30 s).
6. Size check: 10 s at 16 kHz × 16-bit ≈ **320 KB**, well under Vercel's **4.5 MB request-body limit**. Audio goes from the browser straight to Azure through the SDK with a short-lived token, so it never passes through Vercel at all.
7. iOS gotchas: create or resume the `AudioContext` inside the tap handler; HTTPS is required (Vercel provides it).
   On iOS 26, getUserMedia can get stuck returning `NotAllowedError` after a media-services reset (WebKit bug 319706),
   so show a friendly "reload the page to fix your microphone" screen instead of a dead button.

**Which pitch tracker scores the attempt:** pitchy has no voicing model and no octave-error repair, and errors at the end of a phrase
(creaky voice, octave jumps) are exactly what flip a "falling" verdict. Phase 0a therefore runs a small test: 20–50 recordings
(you, classmates, TTS) analysed by pitchy, SwiftF0 and Parselmouth/Praat as the reference. The most accurate browser option becomes the scorer.

**Pitch post-processing** (in the worker):
pitchy (or SwiftF0) per frame (about 40 ms window, 5–10 ms hop) → keep frames with clarity > ~0.9, loud enough, and within 70–500 Hz → 5-frame median filter → fix octave jumps → fill gaps under 100 ms → **convert to semitones relative to the speaker's baseline** (median pitch of the utterance, or of the first thought group). Semitones make a male and a female voice comparable.

---

## 5. Rule engine (intonation scoring)

1. **Levels.** Each syllable gets the mean semitone value over its Azure time span, then a level. Starting thresholds, to be calibrated with native/TTS recordings:
   level 1 < −2 st ≤ level 2 ≤ +2 st < level 3 ≤ +6 st < level 4.
2. **Per thought group** (thought-group boundaries and the target syllable are stored in the lesson data):
   - `startsAtMid`: first stressed region near level 2
   - `singlePeak`: exactly one prominent local maximum
   - `peakOnTarget`: the peak lies inside the target stressed syllable (± one syllable tolerance → partial credit)
   - `endingCorrect`: final 200–300 ms slope and level match the pattern (fall to 1 / return to 2 / rise or stay at 3)
   - `range`: p90–p10 spread ≥ ~4 st, otherwise "flat"
3. **Shape similarity:** dynamic time warping between the learner's and the reference's normalised semitone contours gives a 0–100 "sounds like the model" score.
4. **Final scores shown to the learner:** **Pattern ✓/✗**, **Peak in the right place**, **Pitch range**, plus Azure **Pronunciation accuracy** and **Prosody**.
5. Accepted variants: some sentences have more than one valid reading (tag questions, emphatic stress). The lesson data can list alternative patterns, each tagged with its meaning ("you sound *sure*").

---

## 6. IPA display

- **Before speaking:** each word shows its dictionary IPA from CMUdict, with ˈ on the stressed syllable. The **target syllable** (where the peak belongs) is highlighted.
- **After speaking:** each phoneme is coloured by Azure's accuracy score. Tapping a word shows *expected* vs *what you said*, e.g. `/ˈdɔɡz/ → you said /ˈdɔɡ/` (dropped final /z/), from the spoken-phoneme n-best.
- The pitch contour sits **above** the words, and the IPA row sits **below** them, the same layout as the textbook.

```
   4 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   3 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╭──╮┄┄┄┄┄┄   ── target (textbook line)
   2 ──────────────────────────╯   ╲      ~~ you (live pitch)
   1 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╲────
      She   is   a   pretty   [WO]man.
     /ʃi/ /ɪz/ /ə/ /ˈprɪ.ti/ /ˈwʊ.mən/
   ✓ Falling 2-3-1   ✓ Peak on WO-   ⚠ Range a bit narrow
```

---

## 7. Drawing quizzes: the same rule engine, a different input

Learners must be able to show the pattern **two ways**: by **saying** it and by **drawing** it. Both feed **one checker**,
so every result lands in the same skill categories (section 8).

```
 Voice:   mic ─► pitch contour ─► per-syllable level (1–4) ─┐
                                                            ├─► RULE ENGINE ─► findings ─► skill scores
 Drawing: finger/mouse stroke ─► per-syllable level (1–4) ──┘     (start, single peak, peak position,
                                                                   ending, range, thought groups)
```

**How a drawing quiz works**
1. The sentence is shown with syllables spaced out, and 4 faint level lines behind it (like the textbook).
   Modes: *draw freely* (harder) or *tap a level for each syllable* (easier, better on small phones).
2. The learner drags a line from left to right (Pointer Events, so it works with finger, mouse or stylus).
   An optional **"snap to levels"** setting rounds the stroke to the 4 lines.
3. **Scoring:** sample the stroke at each syllable's x-position, then turn its height into a level 1–4 → `[2,2,2,2,2,3,1]`.
   This is the same array that comes out of voice analysis, so the same rule engine checks start level, single peak,
   peak on the stressed syllable, ending direction and thought-group breaks.
   An extra **shape score** compares the whole stroke with the target line using banded DTW, so a nearly right but slightly shifted line still earns credit.
   Write the DTW yourself (about 30 lines); the npm DTW packages are stale. Don't use $1/$Q gesture recognizers:
   they ignore rotation and scale, so a rise and a fall can look the same to them.
   Drawing is new: no existing open-source app has a "draw the contour and get scored" exercise. Research on Mandarin
   learners who drew their own pitch curves (Chun et al. 2015) supports the idea.
4. Feedback is specific: "Your rise is on *PRE-* but it should be on *WO-*", with the correct line animated over theirs.
5. **Variants:**
   - *Draw it, then say it:* draw first, then record. The app overlays drawing, voice and target, which shows whether the learner
     *knows* the pattern but can't yet *produce* it.
   - *Fix the line:* a wrong contour is shown, and the learner drags its points to correct it.
   - *Two thought groups:* the learner must also place the break (the `|` symbol) before drawing, for 2-3-2 and tag questions.

---

## 8. Personalized progress analytics

Every answer, spoken or drawn, is broken into **skills**, so the app can tell each learner exactly what to work on.

**Skill map** (pattern × sub-skill × how it was answered)

| | Starts at 2 | One peak | Peak on stressed syllable | Correct ending | Pitch range | Thought-group breaks | Hears it (listening) |
|---|---|---|---|---|---|---|---|
| Falling 2-3-1 | 🗣 ✏️ | 🗣 ✏️ | 🗣 ✏️ | 🗣 ✏️ | 🗣 | — | 👂 |
| Non-final 2-3-2 | 🗣 ✏️ | 🗣 ✏️ | 🗣 ✏️ | 🗣 ✏️ | 🗣 | 🗣 ✏️ | 👂 |
| Rising 2-3 (yes/no, address, lists) | 🗣 ✏️ | 🗣 ✏️ | 🗣 ✏️ | 🗣 ✏️ | 🗣 | 🗣 ✏️ | 👂 |
| Tag: sure / not sure | 🗣 ✏️ | 🗣 ✏️ | 🗣 ✏️ | 🗣 ✏️ | 🗣 | 🗣 ✏️ | 👂 |

🗣 = speaking · ✏️ = drawing · 👂 = listening quiz. Pronunciation (IPA accuracy, e.g. dropped final consonants) is tracked as an extra row.

**Mastery score:** each skill cell keeps a 0–100 score updated after every attempt
(a weighted moving average, so recent attempts count more and the score recovers as the learner improves),
plus a confidence value based on how many attempts it rests on. Cells with few attempts are shown as "not enough data yet".

**The insight that makes it personal: compare drawing with speaking**

| Drawing | Speaking | What the app tells the learner |
|---|---|---|
| High | High | "Mastered ✓" (shows up less often in reviews) |
| High | Low | "You **know** the pattern. Now train your **voice**." → shadowing exercises, slow playback, exaggerate the rise |
| Low | High | "Your ear and voice are good. Learn the **rule** to be consistent." → rule cards plus drawing drills |
| Low | Low | "Start here." → lesson review from the beginning of that unit |

**"My Progress" screen**
- **Skill heat map** (the table above, coloured by mastery) and a **radar chart** per pattern.
- **Top 3 things to improve**, worded plainly in Thai and English, each with a **"Practice this"** button that builds a
  5-minute review lesson from just those skills (spaced repetition: weak skills come back sooner).
- **Trend lines:** pitch range in semitones over time (are you less flat?), peak-placement accuracy, Azure prosody score.
- **Before/after:** your first and latest recording of the same sentence, with both contours overlaid and playable.
- **Weekly summary** written by Claude from the stats ("This week your yes/no questions improved from 45 to 72.
  Your wh-questions still rise at the end; try …"), cached once per week.
- **Private by default.** Only the learner sees their analytics. A teacher/class dashboard can come later, opt-in only.

**Libraries:** no maintained gamification engine exists, so XP, streaks and badges are a few Supabase tables we write ourselves.
Review timing uses **ts-fsrs** (MIT). The mastery model takes ideas from **OATutor** (MIT, React, Bayesian Knowledge Tracing)
and **pyBKT** (MIT). An Elo-style update is the simple alternative, about 20 lines.

**Computing it:** each attempt saves its findings to Supabase. A Postgres function (or a Next.js route) updates
`skill_mastery` rows in the same transaction, so the dashboard is a cheap read. Charts are custom SVG or Recharts.

---

## 9. UX: Duolingo-style, original look

Borrow the **patterns** that make Duolingo work. Do **not** copy its name, owl, exact green, fonts, sounds or illustrations.

**Structure**
- **Home = a winding path** of lesson nodes grouped in units:
  1. Hearing the 4 levels · 2. Falling 2-3-1 · 3. Rising 2-3 (yes/no, address, interjections) · 4. Lists & choices · 5. Non-final 2-3-2 (compound, complex, conditional, intro phrases) · 6. Tag questions: sure vs. not sure · 7. Mixed review / checkpoint
- **Lesson = 8–12 short exercises**, a progress bar on top, a big **CHECK** button at the bottom, and a feedback sheet that slides up (green "Nice!" / amber "Almost — your voice went up at the end").

**Exercise types** (listening first, speaking last, so learners gain confidence before recording)
1. **Hear it:** play two versions and pick the rising or the falling one.
2. **Which pattern?** Listen and tap 2-3-1, 2-3-2 or 2-3.
3. **Find the peak:** tap the word, then the syllable, that carries the rise.
4. **Draw it:** drag a line over the sentence; it is scored by the same rule engine as the voice (section 7).
5. **Meaning match:** a tag question in two tones, then pick "sure" or "asking".
6. **Shadow it:** listen, then record. Show the contour, IPA and scores.
7. **Say it your way:** read a new sentence with no model audio, then get scored.

**Motivation**
- XP, a daily goal, a streak, and lesson-complete celebrations with confetti and the mascot dancing.
- **Psychological safety by design**, since the project was born from public embarrassment:
  - practice is **private by default**, with no public leaderboard (an opt-in friends league can come later);
  - speaking exercises **never cost hearts** (hearts only on listening quizzes, or no hearts at all);
  - progress is compared **with yourself** ("12% closer to the model than yesterday"), never with classmates;
  - unlimited retries, and a "skip mic today" option that swaps in listening exercises.
- **Bilingual UI** (TH/EN toggle); tips are written in simple Thai.
- Accessibility: never signal with colour alone (pair it with ✓/⚠ icons), use large tap targets, and offer a "slow" playback button.

---

## 10. Data model (Supabase)

- `profiles` (id, display_name, ui_lang, daily_goal_xp, streak_count, streak_last_day)
- `lesson_progress` (user_id, lesson_id, stars, best_score, completed_at)
- `attempts` (user_id, sentence_id, **modality** `speak|draw|listen`, pattern, levels int[] (the per-syllable 1–4 array),
  checks jsonb (`{startsAtMid, singlePeak, peakOnTarget, endingCorrect, rangeSt, breaksOk}`), similarity,
  azure_accuracy, azure_prosody, phoneme_errors jsonb, created_at).
  **Audio is not stored by default.** For the before/after feature, keep only the first and latest clip per sentence, and only with the learner's opt-in consent (Thailand's PDPA covers voice data). Clips go in Supabase Storage with row-level security.
- `skill_mastery` (user_id, pattern, skill, modality, score 0–100, attempts_n, last_seen, next_review_at), with a primary key on all four identifying columns
- `xp_events` (user_id, amount, source, created_at)
- `weekly_summaries` (user_id, week_start, text_en, text_th, stats jsonb), the cached Claude summary
- Lessons live in `content/lessons/*.json`:
  ```json
  { "id": "fall-01", "text": "She is a pretty woman.", "pattern": "2-3-1",
    "thoughtGroups": [{ "from": 0, "to": 4, "pattern": "2-3-1",
                        "nucleus": { "word": 4, "syllable": 0 } }],
    "ipa": [["ʃi"],["ɪz"],["ə"],["ˈprɪ","ti"],["ˈwʊ","mən"]],
    "audio": "/audio/fall-01.mp3", "alternatives": [] }
  ```

---

## 11. Vercel deployment notes

- Environment variables: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `ANTHROPIC_API_KEY`, and the Supabase URL and keys. Only the anon key reaches the browser.
- `/api/speech-token` exchanges the key for a 10-minute Azure token. **Never ship the Azure key to the client.** Add a rate limit per user/IP.
- Region: choose the Azure region nearest Thailand (e.g. Southeast Asia, Singapore) **after confirming prosody assessment is offered there**; otherwise use East US.
- Reference audio is generated by a script at build or authoring time and served as static files, so there is no TTS cost per learner.
- Vercel Hobby is free for personal, non-commercial projects, which fits a class project. Move to Pro if it becomes a product.

**Rough running cost:** Azure's free F0 tier includes **5 audio hours per month** of speech-to-text, and pronunciation assessment is billed as speech-to-text. At about 5 s per attempt that is roughly 3,600 attempts per month free. Some sources say prosody is a paid **add-on** per hour, so check the official pricing page before launch. Claude tips are short, cost very little, and can be cached.

---

## 12. Build phases

| Phase | Goal | Done when |
|---|---|---|
| **0a. Spike, no Azure needed (≈1 week)** | One test page with the **shared rule engine**, the **recorder + pitch contour** (native rate + own 16 kHz downsampler), and the **drawing canvas** (perfect-freehand + DTW shape score). Checks that don't need word timing (start level, one peak, ending direction, pitch range) run on both voice and drawings. **Pitch-tracker test:** pitchy vs SwiftF0 vs Praat on 20–50 recordings | Your own correct and "Thai-style" readings are told apart; drawn lines are scored correctly; the scoring tracker is chosen |
| **0b. Spike + Azure** | Add Azure alignment (peak-on-stressed-syllable check, IPA, prosody), the CMUdict→IPA build script with one shared IPA symbol set, and TTS reference audio (non-HD voices, automatic pitch check). Optional: a 14-day Speechace trial as a second opinion on rise/fall for tag questions | All 5 test sentences pass with TTS audio; thresholds tuned |
| **1. MVP** | Unit 2 (Falling 2-3-1) end to end: path, lesson player, listen, draw and speak exercises, results screen with contour + IPA. Supabase login, attempts saved | A classmate can finish a lesson on their phone and their attempts appear in the database |
| **2. Full course + analytics** | All units from the PDFs, tag questions, `skill_mastery` updates, **My Progress** screen (heat map, top 3 to improve, "Practice this" review lessons scheduled with ts-fsrs), XP/streak | All ~80 textbook sentences playable; analytics reflect real attempts |
| **3. Polish** | Mascot animations, sounds, Claude tips + weekly summary in Thai/English, before/after recordings, PWA, mic-check screen, onboarding | Test with 5–10 classmates; collect feedback |
| **4. Extras** | Teacher mode (paste a sentence → auto IPA + mark the nucleus → assign to class), opt-in class dashboard, LINE Login | — |

---

## 13. Decisions and remaining risks

**Decided (your answers):**
- **Accent:** not sure / mixed → default to **American English (en-US)**. The textbook patterns (2-3-1, 2-3-2, 2-3) are the same in both accents, and en-US is the only accent with Azure prosody scoring. IPA is shown in US form.
- **Model audio:** **Azure Neural TTS first**. Each clip must pass its own pattern check before it is used. Teacher recordings can replace clips later without code changes.
- **Audience:** **your class and friends** → free tiers throughout: Vercel Hobby, Supabase Free, Azure F0 (about 5 audio hours/month), and a small Claude bill (tips are short and cached).
- **Accounts you have:** Vercel, Supabase, Anthropic. **Still needed: Azure.** As a university student, try **Azure for Students** (US$100 credit, no credit card, sign up with your school email). Then create a **Speech** resource on the free **F0** tier and copy its key and region. You have to sign up yourself; I can't create accounts. Phase 0a doesn't need Azure, so work can start now.
- **New requirements:** drawing quizzes scored by the same engine as the voice (section 7) and personalized analytics across speaking, drawing and listening (section 8).

**Remaining risks:**

- **Threshold tuning:** level boundaries in semitones must be calibrated against real recordings. Plan time for this in Phase 0.
- **Pitch errors:** creaky voice at the ends of falls, background noise, and whispering all hurt pitch detection. Mitigate with clarity gating, smoothing, and an "I couldn't hear your pitch clearly, try again" state instead of a wrong verdict.
- **More than one correct answer:** emphasis can legitimately move the peak. Lessons should declare accepted alternatives.
- **iOS Safari** may ignore the processing-off constraints, so test early on real iPhones.
- **TTS intonation** is sometimes flatter than a teacher's. Clips that fail their own pattern check get regenerated with SSML pitch adjustments or are flagged for a human recording.
- **Analytics need volume:** mastery scores mean little after 1–2 attempts, so the dashboard says "not enough data yet" until a skill has about 5 attempts.
- **No product does this yet:** the research found no API or open-source project that grades 2-3-1 / 2-3-2 / 2-3 patterns,
  and no Thai-learner English corpus to test against. Our own recordings of classmates become the test set (with their consent).
- **Unverified prices:** Speechace (~$80/month) and Azure's paid per-hour rates come from third-party sources. Check them before paying for anything.

---

## 14. What we reuse, and license rules

**Reuse or learn from**
- **OpenPronounce** (MIT): a self-hosted alternative to Azure (wav2vec2 IPA + espeak + pYIN pitch). It's our backup plan if Azure ever stops fitting, but it needs a Python server with about 2.4 GB of models (e.g. Modal, roughly $0 at class scale).
- **Inton@Trainer 2** (MIT): reference for comparing learner and model contours with DTW.
- **pitch-pair** (MIT): an example that ties spaced repetition to pitch drills. **mandarin-tone-visualizer** (MIT): tone-overlay UI ideas.
- **react-duolingo** (MIT, Next.js + Tailwind): code patterns for the lesson flow only.
- Open IPA recognizers for later, if we drop Azure: `wav2vec2-lv-60-espeak-cv-ft` (Apache-2.0, ~1.2 GB) and **ZIPA** (MIT code, CC-BY weights, 64M size small enough for a browser).

**Do not ship in the app**
- GPL/AGPL code in the browser bundle: essentia.js, pitchfinder, espeak-ng WASM / phonemizer.js, Allosaurus, Peaks.js (LGPL, avoid for simplicity).
  GPL tools such as Parselmouth and espeak-ng are fine in **build scripts or a separate server**.
- Non-commercial model weights: the MMS forced aligner, ZIPA "-ns" models, F5-TTS, XTTS-v2.
- Repos with **no license**, which means no permission to copy: the original "Lingo" Duolingo-clone tutorial, kylebgorman/syllabify, Recorderjs, IntonationCoach.
  Learn from them; write our own code.
- **Duolingo-style assets:** the mascot and sounds inside the MIT "Lingo" re-upload (sanidhyy/duolingo-clone). Use only our own Melobi art and sounds.
- Stale or archived dependencies: RecordRTC, aubiojs, Gruut, OpenPhonemizer, Charsiu, AuToBI.

---

## Sources
- **Full research report** with links, licenses and maintenance status for every tool above: [research-open-source-and-apis.md](research-open-source-and-apis.md)
- Course material: *Sentence Intonation* (Package 69, pp. 74–80) and *Intonation* slides
- Azure pronunciation assessment (prosody, IPA, syllables, n-best phonemes, 30 s limit): https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment
- Azure prosody score property: https://learn.microsoft.com/en-us/dotnet/api/microsoft.cognitiveservices.speech.pronunciationassessment.pronunciationassessmentresult.prosodyscore?view=azure-dotnet
- Azure for Students: https://azure.microsoft.com/free/students/ · eligibility Q&A: https://learn.microsoft.com/en-us/answers/questions/5882721/i-am-student-and-i-want-apply-to-student-account-t
- Azure Speech pricing: https://azure.microsoft.com/pricing/details/cognitive-services/speech-services · billing Q&A: https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat
- Vercel function limits (4.5 MB body, durations, bundle size): https://vercel.com/docs/functions/limitations · https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- pitchy (McLeod Pitch Method): https://github.com/ianprime0509/pitchy
- getUserMedia audio constraints: https://blog.addpipe.com/getusermedia-audio-constraints.md
- wav2vec2 phoneme (IPA) models, an alternative to Azure: https://huggingface.co/docs/transformers/model_doc/wav2vec2_phoneme
- Thai learners' question intonation and L1 transfer (Mahidol): https://repository.li.mahidol.ac.th/handle/123456789/113866
- Prosodies in polar/informative questions by Thai speakers (JCSI): https://ejournal.unimap.edu.my/index.php/jcsi/article/view/1050
- Thai learners' focus marking and compressed pitch range (Newcastle PhD): https://dspace.ncl.ac.uk/jspui/bitstream/10443/5961/1/KamphikulN2022.pdf
- Interlanguage intonation and intelligibility (Chulalongkorn): https://digital.car.chula.ac.th/chulaetd/17619
- Duolingo UX and gamification analyses: https://uxplanet.org/ux-and-gamification-in-duolingo-40d55ee09359 · https://blakecrosley.com/guides/design/duolingo · https://uxdesign.cc/the-good-the-bad-and-the-ugly-of-duolingo-gamification-3a12f0e80dc7
