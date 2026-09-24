# Implementation Plan: Meal Photo Nutrition Tracking

**Branch**: `001-meal-photo-nutrition-tracking` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-meal-photo-nutrition-tracking/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Users photograph or upload a meal photo; the system identifies individual food items, estimates macro/micronutrients (preferring authoritative barcode/restaurant data over visual guesses when available), flags allergens and dietary-restriction conflicts, and lets users record how much was actually eaten (manual fraction, per-item, or before/after photo comparison). The experience is a single Next.js app (building on the existing static mockup, restyled with shadcn/ui) deployed on Vercel, whose route handlers orchestrate image validation, a pluggable vision/inference provider, and pluggable nutrition-data providers (generic food database, barcode/label lookup, restaurant data), always disclosing uncertainty and data source rather than presenting guesses as fact.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 14 (App Router), deployed on Vercel; Node.js 20 runtime for route handlers/server actions

**Primary Dependencies**: Next.js (route handlers double as the REST API — no separate backend service), shadcn/ui + Tailwind CSS (UI components), Zod (request/response validation), Prisma (ORM), Inngest (durable background jobs for any pipeline step that may exceed Vercel's serverless function time limit — vision-provider calls, before/after photo diffing), a vision/food-recognition provider accessed through an internal `FoodVisionProvider` interface (vendor-agnostic; concrete vendor is a deployment-time configuration choice, not a spec concern), USDA FoodData Central client for generic food nutrition, Open Food Facts client for barcode/label lookup, an internal `RestaurantNutritionProvider` interface for restaurant menu data (vendor-agnostic, online-only)

**Storage**: PostgreSQL via Vercel Postgres/Neon (users, dietary restrictions, meal log entries, food items, consumption records); Vercel Blob (meal photos, before/after photo pairs)

**Testing**: Vitest (unit), Vitest + Next.js route handler testing (API integration), contract tests against recorded fixtures for each external provider (vision, USDA, Open Food Facts, restaurant), Playwright (browser e2e for upload → result → log flow)

**Target Platform**: Responsive web app (mobile and desktop browsers) hosted on Vercel, using browser `MediaDevices`/`<input type=file>` APIs for camera capture and upload; no native mobile app in this iteration

**Project Type**: Web application (single Next.js project, frontend + API routes combined)

**Performance Goals**: p95 photo-to-result latency ≤ 5s (SC-001); async processing (via Inngest background jobs) with progress feedback for any step expected to exceed 2s (constitution IV), keeping individual route handlers within Vercel's execution time limits

**Constraints**: Must never fabricate or log real nutrition data for non-food/blurry/invalid/corrupted images (SC-002); must degrade gracefully to visual estimation when offline or when barcode/restaurant lookup is unavailable (FR-026); must not crash on invalid file types or corrupted images (FR-014); allergen labeling and restriction-conflict flags are mandatory on every applicable result (SC-003)

**Scale/Scope**: MVP scope covers all P1 user stories (identification & estimation, uncertainty honesty, allergens & restrictions) plus P2 stories (consumption tracking, authoritative data sources); initial target is direct-to-consumer usage at low-to-moderate concurrent scale (hundreds of concurrent scans), not enterprise-scale traffic

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Code Quality | Image ingestion, vision-provider calls, and nutrition-calculation logic must stay in separate modules; all external calls (object storage, vision provider, nutrition providers) must handle failure/timeout explicitly | PASS — planned module boundaries (`ingestion`, `vision`, `nutrition`, `consumption`, `restrictions`) keep concerns separate; contracts below define explicit error responses per external dependency |
| II. Testing Standards (NON-NEGOTIABLE) | Must have unit, integration, and contract tests; must explicitly cover blurry photos, non-food items, multi-item plates, empty/corrupted uploads, unsupported formats, oversized files | PASS — test plan includes contract tests per provider and integration tests mapped 1:1 to spec edge cases; enforced at task-generation time, not deferred |
| III. UX Consistency | Consistent feedback across upload/processing/success/failure; specific (not generic) messaging for poor quality, non-food, ambiguous items | PASS — API contracts define a shared `ScanResult` envelope with a `status` + `message` + `data source` shape reused across all outcome types (success, low-quality, non-food, empty-plate, ambiguous) |
| IV. Performance Requirements | Client+server validation before processing; p95 target tracked; async processing with progress feedback if >2s | PASS — upload contract validates file type/size before invoking vision provider; scan route hands off to an Inngest background job and returns a pollable job id so the UI can show progress beyond 2s without hitting Vercel function time limits |
| Domain Gate: quality/non-food detection are distinct steps | Photo quality and non-food detection must be distinct, testable pipeline steps; no fabricated data for low-confidence content | PASS — data model and contracts separate `qualityCheck`, `contentClassification`, and `foodIdentification` as distinct pipeline stages with independent outputs |

No violations requiring Complexity Tracking justification.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/                      # Next.js App Router
├── (marketing)/          # landing/scan entry, evolving mockup/'s static HTML
├── scan/                 # scan upload + result pages
├── meals/[id]/           # meal detail, confirmation, consumption pages
├── profile/              # dietary restrictions management
└── api/                  # route handlers (REST contract), one folder per resource
    ├── scans/
    ├── meal-log-entries/
    └── users/

components/
├── ui/                   # shadcn/ui primitives (generated)
└── meal/                 # camera/upload widget, result card, allergen/conflict badges, consumption controls

lib/
├── models/               # Meal Log Entry, Food Item, Nutrition Estimate, User Profile, Consumption Record (Prisma schema + types)
├── services/
│   ├── ingestion/        # upload validation, quality/blur detection, non-food classification
│   ├── vision/           # FoodVisionProvider interface + adapter(s)
│   ├── nutrition/        # USDA/OpenFoodFacts/restaurant providers, source-selection logic
│   ├── restrictions/     # allergen labeling, dietary conflict flagging
│   └── consumption/      # manual %, per-item, before/after photo diffing
└── jobs/                 # Inngest function definitions for async pipeline steps

tests/
├── contract/             # per-provider fixture-based contract tests
├── integration/          # upload-to-result pipeline (route handlers), one test per spec edge case
├── unit/
└── e2e/                  # Playwright flows for scan → result → log
```

**Structure Decision**: Web application (Option 2), collapsed into a single Next.js project rather than separate `frontend/`/`backend/` folders — route handlers under `app/api/` implement the REST contract directly, so there is no separate deployable backend. The existing `mockup/` (static HTML/CSS/JS) defines the visual direction and is superseded by `app/` + `components/` (restyled with shadcn/ui); `lib/services/` and `lib/jobs/` own all provider orchestration, persistence, and business rules so nutrition/allergen/consumption logic never lives in client components.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
