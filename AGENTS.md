<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Melobi — project instructions

**Read `SPEC.md` first.** It is the build spec and handoff: product, the intonation rules from the course, the current code,
the roadmap with acceptance criteria, env vars and the database schema. Background: `docs/PLAN.md`, `docs/research-open-source-and-apis.md`.

Must-follow rules (details in SPEC.md §4):

- Imports inside `src/lib/**` use explicit `.ts` extensions and erasable TypeScript only (Node runs `tools/*.ts` directly).
- Keep `src/lib/intonation/*` and `src/lib/audio/*` (except `recorder.ts`) pure: no DOM, no React.
- Every feedback string is bilingual `{ en, th }`.
- Before finishing a task: `npm test && npm run lint && npx tsc --noEmit && npm run build`. Add tests for engine/audio changes
  (use `synthesizeSentence` + `ERROR_STYLES`).
- No GPL/AGPL/unlicensed/non-commercial code or models in the app; GPL tools only in local/build scripts.
- No Duolingo name, owl, colours, fonts, sounds or art. Use the Melobi tokens in `src/app/globals.css`.
- Audio: native-rate AudioContext (never request 16 kHz), AEC/NS/AGC off, start audio inside the user's tap.
- Secrets stay server-side; don't commit `.env*`; don't store learner audio without opt-in.
