# Tasks: Local Reconstruction and Installation

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

Checkable setup and validation tasks for a first-time developer. Commands are Windows PowerShell;
Linux/macOS equivalents are in [docs/LOCAL_SETUP.md](../../docs/LOCAL_SETUP.md).

## Setup

- [ ] **T1 — Prereqs:** Git, Node.js ≥ 20.12 (`node --version`), npm, PostgreSQL installed and
  running.
- [ ] **T2 — Clone:** `git clone https://github.com/scottzastrow/Food4Thought.git; cd Food4Thought`.
- [ ] **T3 — Install:** `npm install --legacy-peer-deps` completes without errors.
- [ ] **T4 — Env file:** copy `.env.example` to `.env.local`; set `DATABASE_URL` and
  `PHOTO_STORAGE_DIR` (`./data/photos`). Leave optional keys empty for stub mode.
- [ ] **T5 — Database:** create the database (`createdb food4thought` or equivalent).
- [ ] **T6 — Prisma:** `npx prisma generate` then `npx prisma migrate deploy` — all four
  migrations applied.
- [ ] **T7 — Seed:** `npm run db:seed` prints `[seed] demo user profile ready`; run it twice to
  confirm idempotency.
- [ ] **T8 — App:** `npm run dev` serves `http://localhost:3000`.
- [ ] **T9 — Inngest:** second terminal, `npx inngest-cli dev`; the dev server discovers the app
  at `http://localhost:3000/api/inngest` without any keys.

## Validation

- [ ] **T10 — First photo (stub mode):** at `/scan`, upload any JPEG/PNG/WebP ≤ 2 MB. Expect the
  result page to reach `identified` with the deterministic stub item ("apple", 182 g) and a
  labeled data source. No external account needed.
- [ ] **T11 — Rejection paths (stub mode):** uploading a non-image or > 2 MB file returns a
  friendly `rejected_invalid_file` message, HTTP 4xx, no crash.
- [ ] **T12 — Real nutrition (optional):** set `USDA_FDC_API_KEY`, restart, rescan; nutrition
  shows a USDA data source instead of the approximate fallback.
- [ ] **T13 — Real vision (optional):** set `VISION_PROVIDER=openai` + `OPENAI_API_KEY`, restart,
  rescan; identified foods come from the actual photo.
- [ ] **T14 — Seed guard:** on a brand-new empty database, `npm run db:seed` before the first
  scan prevents the Prisma P2003 foreign-key error on `POST /api/v1/scans`.
- [ ] **T15 — Test suite:** `npm test` passes (Vitest: unit + integration + contract).
- [ ] **T16 — Static checks:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.
- [ ] **T17 — E2E (optional):** with the app running, `npm run e2e` (Playwright) passes; first
  run may require `npx playwright install`.

## Explicitly not validated without extra resources

- Production deployment over HTTPS with Inngest Cloud keys (`INNGEST_EVENT_KEY`,
  `INNGEST_SIGNING_KEY`) — requires a public HTTPS endpoint and an Inngest Cloud account.
- Real OpenAI/USDA behavior — requires the developer's own third-party credentials.
- Clean-machine reproduction — requires a machine/VM that has never built this repository.
