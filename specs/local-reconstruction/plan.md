# Implementation Plan: Local Reconstruction and Installation

**Spec:** [spec.md](spec.md) · **Date:** 2026-10-12

## Architecture (as reconstructed from the repository)

```mermaid
flowchart LR
    subgraph Browser
        UI[/scan page, /meals/[id], /profile/]
    end
    subgraph Next.js 14 (App Router)
        API[/\/api\/v1\/scans/]
        JOBAPI[/\/api\/inngest/]
        OTHER[/\/api\/v1\/... consumption, restrictions, admin/]
    end
    subgraph Background
        INNGEST[Inngest dev server or Inngest Cloud]
        JOB[process-scan job]
    end
    subgraph Data
        PG[(PostgreSQL via Prisma)]
        FS[Local photo storage<br/>PHOTO_STORAGE_DIR, outside public/]
    end
    subgraph External - optional
        OAI[OpenAI vision + match selection]
        USDA[USDA FoodData Central]
        REST[Restaurant nutrition vendor]
    end

    UI --> API --> PG
    API --> FS
    API --> INNGEST --> JOBAPI --> JOB
    JOB --> PG
    JOB -. VISION_PROVIDER=openai .-> OAI
    JOB -. USDA_FDC_API_KEY .-> USDA
    JOB -. USDA_MATCH_SELECTOR=openai .-> OAI
    JOB -. RESTAURANT_NUTRITION_API_BASE_URL .-> REST
```

## Dependencies and minimum versions (verified)

| Tool | Minimum | Why |
|---|---|---|
| Git | any current | clone the repository |
| Node.js | **20.12+** (20/22/24 LTS) | `prisma/seed.ts` uses `process.loadEnvFile` (added in Node 20.12); Next.js 14 needs ≥ 18.17 |
| npm | bundled with Node | install; `--legacy-peer-deps` required (see below) |
| PostgreSQL | any version supported by Prisma 5 (14+ recommended) | `DATABASE_URL` target; local install, Docker, or hosted all work |
| Inngest CLI | latest via `npx inngest-cli dev` | local background-job server; fetched by npx on first run (needs network once); not a package.json dependency |

`package.json` declares `"engines": { "node": ">=20.12" }` (added during this audit); the
Node floor is derived from actual API usage.

## Environment variables (verified via `process.env` audit of `app/` and `lib/`)

| Variable | Required? | Default behavior when unset |
|---|---|---|
| `DATABASE_URL` | **Yes** | Prisma cannot connect; migrations and the app fail |
| `PHOTO_STORAGE_DIR` | **Yes** (first upload) | `LocalPhotoStorage` throws `PHOTO_STORAGE_DIR must be configured` |
| `USDA_FDC_API_KEY` | Optional | Nutrition uses labeled approximate generic estimates or "unavailable" |
| `VISION_PROVIDER` | Optional | Deterministic stub vision provider (no external calls) |
| `OPENAI_API_KEY` | Optional | Required only when `VISION_PROVIDER=openai` and/or `USDA_MATCH_SELECTOR=openai` |
| `OPENAI_VISION_MODEL` | Optional | Defaults to `gpt-4.1-mini` |
| `USDA_MATCH_SELECTOR` | Optional | Deterministic stub selector abstains; name-search candidates still stored |
| `OPENAI_MATCH_MODEL` | Optional | Defaults to `gpt-4.1-mini` |
| `ADMIN_REVIEW_TOKEN` | Optional | `/admin/food-mappings` review UI disabled |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Optional locally; **required for Inngest Cloud** | Local dev server works without them |
| `RESTAURANT_NUTRITION_API_BASE_URL` / `RESTAURANT_NUTRITION_API_KEY` | Optional | Restaurant lookup treated as offline; stub provider never matches |

## Installation sequence

1. Clone; install Node 20.12+ and PostgreSQL.
2. `npm install --legacy-peer-deps` (flag works around an unrelated optional peer-dependency
   conflict between `inngest`'s SvelteKit integration and Vite-based tooling).
3. Copy `.env.example` to `.env.local`; set `DATABASE_URL` and `PHOTO_STORAGE_DIR`.
4. Create the PostgreSQL database (e.g. `createdb food4thought`).
5. `npx prisma generate` → `npx prisma migrate deploy` → `npm run db:seed` (idempotent demo user;
   skipping it causes Prisma P2003 on the first scan).
6. Two terminals: `npm run dev` and `npx inngest-cli dev`.
7. First-photo acceptance test (see [docs/LOCAL_SETUP.md](../../docs/LOCAL_SETUP.md)).

## Credentials

- **None required for stub mode.** The full scan pipeline runs deterministically offline.
- **USDA FDC key** (free, https://fdc.nal.usda.gov/api-key-signup) — real nutrition data.
- **OpenAI API key** (paid, https://platform.openai.com/api-keys) — real photo analysis
  (`VISION_PROVIDER=openai`) and/or AI-assisted USDA match selection (`USDA_MATCH_SELECTOR=openai`).
  The two toggles are independent; either, both, or neither may be enabled.
- Credentials are server-only: all provider calls happen in the Inngest `process-scan` job or
  route handlers; no key is exposed to the browser.

## Service boundaries

- **Photo storage:** local filesystem only (`LocalPhotoStorage`); the ID pattern and the
  `public/`-exclusion guard are enforced in code. Production object storage would be a new
  adapter behind `PhotoStorage` (see ADR-003/ADR-004) — out of scope for local reconstruction.
- **Background jobs:** Inngest. Locally, the dev server discovers the app at
  `http://localhost:3000/api/inngest`; functions served: `process-scan`, `discover-vocabulary`.
  Production uses Inngest Cloud with the event/signing keys over HTTPS (ADR-002).
- **Vision / nutrition / restaurant providers:** env-gated adapters with deterministic stubs as
  the default; provider keys are read at call time, never at module import for stubs.
- **Admin review:** token-gated UI, disabled when `ADMIN_REVIEW_TOKEN` is unset.

## Documentation corrections applied during the audit

- `specs/001-meal-photo-nutrition-tracking/quickstart.md` previously referenced `vercel dev` and
  "Vercel Blob (or local emulator)"; it now reflects the actual `next dev` server, local
  filesystem photo storage (`PHOTO_STORAGE_DIR`), and the verified install/migrate/seed sequence.
  Historical ADR and research documents in `docs/adr/` and `specs/001-meal-photo-nutrition-tracking/`
  intentionally retain their Vercel references as records of the original upstream plan.
