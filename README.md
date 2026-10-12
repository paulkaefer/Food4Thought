# Food4Thought — Meal Photo Nutrition Tracking

Snap it. Track it. No guessing. A Next.js app that identifies foods from a meal photo, estimates
nutrition, flags allergens/dietary conflicts, and tracks how much was actually eaten — while being
honest (and lighthearted) about how uncertain visual estimates are.

See [specs/001-meal-photo-nutrition-tracking/](specs/001-meal-photo-nutrition-tracking/) for the
full spec, plan, data model, API contract, and quickstart validation scenarios.

> **New here?** Start with the [Local Setup Guide](docs/LOCAL_SETUP.md) — a beginner-friendly,
> OS-specific walkthrough from clean clone to first successful photo scan. The reconstruction
> audit lives in [specs/local-reconstruction/](specs/local-reconstruction/spec.md) (spec,
> [plan](specs/local-reconstruction/plan.md), [task checklist](specs/local-reconstruction/tasks.md)).

## Stack

Next.js 14 (App Router) + TypeScript, shadcn/ui + Tailwind, Prisma + PostgreSQL, private local
photo storage, Inngest for background jobs. See [plan.md](specs/001-meal-photo-nutrition-tracking/plan.md) for
the full technical context and rationale.

## Setup

The concise version is below; the full walkthrough with per-step expected results and
troubleshooting is in [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md).

1. Copy `.env.example` to `.env` and fill in the required values:
   - `DATABASE_URL` (PostgreSQL).
   - `PHOTO_STORAGE_DIR` — directory for private meal-photo storage. The default convention is
     `./data/photos` (`data/` is git-ignored). The directory is created automatically on first
     upload, or create it up front:

     ```powershell
     New-Item -ItemType Directory -Path data\photos
     ```

     It must be outside `public/` — meal photos are private and must never be statically served.
   - `USDA_FDC_API_KEY` for real nutrition data (without it, nutrition falls back to labeled
     approximate estimates or "unavailable").
   - `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` only if running against real Inngest Cloud (the
     local Inngest dev server works without them).
   - Optional: `ADMIN_REVIEW_TOKEN` — shared token that enables the `/admin/food-mappings`
     review UI. Leave unset to keep admin review disabled.
2. Install dependencies:

   ```powershell
   npm install --legacy-peer-deps
   ```

   (`--legacy-peer-deps` works around an unrelated optional peer-dependency conflict between
   `inngest`'s SvelteKit integration and this project's Vite-based tooling.)
3. Generate the Prisma client and apply migrations against a real PostgreSQL database:

   ```powershell
   npx prisma generate
   npx prisma migrate deploy
   ```

   (`migrate deploy` applies the checked-in migrations non-interactively. Use
   `npx prisma migrate dev --name <change>` instead when you are authoring new migrations.)
4. Seed the demo user profile that the scan API associates uploads with:

   ```powershell
   npm run db:seed
   ```

   The seed is idempotent — safe to re-run, and it never modifies an existing record. Skipping
   this step on a fresh database makes the first `POST /api/v1/scans` fail with a Prisma P2003
   foreign-key error, because the hardcoded demo `UserProfile` does not exist yet.
5. Run the app and the Inngest dev server in separate terminals:

   ```powershell
   npm run dev
   npx inngest-cli dev
   ```

### AI food analysis (optional)

Real photo analysis and AI-assisted USDA matching are off by default (deterministic stubs, no
external calls). To enable them locally:

- `VISION_PROVIDER=openai` + `OPENAI_API_KEY` (optional `OPENAI_VISION_MODEL`) — real photo analysis.
- `USDA_MATCH_SELECTOR=openai` + `OPENAI_API_KEY` (optional `OPENAI_MATCH_MODEL`) — one batched,
  text-only AI selection of the best-supported USDA record per ingredient, using the first
  analysis's meal context. AI selections stay meal-local (`ai_selected`); they never become
  globally verified mappings.
- `USDA_FDC_API_KEY` — USDA FoodData Central lookups and candidate assembly.

Users can still correct any ingredient name or pick a different USDA record from the assembled
candidate list (`user_selected`) afterward.

## Testing

```powershell
npm test          # unit/integration/contract tests (Vitest)
npm run e2e        # Playwright end-to-end tests (requires `npm run dev` running)
```

See [quickstart.md](specs/001-meal-photo-nutrition-tracking/quickstart.md) for the 16 manual
validation scenarios covering every user story and edge case.

## Known findings (security review)

`npm audit` flags advisories against transitive dev-tooling dependencies (eslint's `glob`/`rimraf`
chain, `postcss` pulled in by `next@14.2.35` itself) and against the `next` package's advisory
range, which spans versions up through the 15/16 line. This project is pinned to `next@14.2.35`,
the latest patched release on the 14.x line; fully resolving the remaining framework-level
advisories requires a major-version upgrade to Next.js 15/16, which is out of scope for this
feature and should be tracked as a separate upgrade task rather than rushed in without a
regression-testing pass.
