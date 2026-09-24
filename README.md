# Food4Thought — Meal Photo Nutrition Tracking

Snap it. Track it. No guessing. A Next.js app that identifies foods from a meal photo, estimates
nutrition, flags allergens/dietary conflicts, and tracks how much was actually eaten — while being
honest (and lighthearted) about how uncertain visual estimates are.

See [specs/001-meal-photo-nutrition-tracking/](specs/001-meal-photo-nutrition-tracking/) for the
full spec, plan, data model, API contract, and quickstart validation scenarios.

## Stack

Next.js 14 (App Router) + TypeScript, shadcn/ui + Tailwind, Prisma + PostgreSQL, Vercel Blob,
Inngest for background jobs. See [plan.md](specs/001-meal-photo-nutrition-tracking/plan.md) for
the full technical context and rationale.

## Setup

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (PostgreSQL), `BLOB_READ_WRITE_TOKEN`
   (Vercel Blob), and `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` if running against real Inngest
   Cloud (the local Inngest dev server works without these).
2. Install dependencies:

   ```powershell
   npm install --legacy-peer-deps
   ```

   (`--legacy-peer-deps` works around an unrelated optional peer-dependency conflict between
   `inngest`'s SvelteKit integration and this project's Vite-based tooling.)
3. Generate the Prisma client and run migrations against a real PostgreSQL database:

   ```powershell
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. Run the app and the Inngest dev server in separate terminals:

   ```powershell
   npm run dev
   npx inngest-cli dev
   ```

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
