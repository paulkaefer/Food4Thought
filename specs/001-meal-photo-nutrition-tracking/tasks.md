---

description: "Task list template for feature implementation"
---

# Tasks: Meal Photo Nutrition Tracking

**Input**: Design documents from `/specs/001-meal-photo-nutrition-tracking/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED — constitution II ("Testing Standards") is NON-NEGOTIABLE and explicitly names the edge cases covered below as mandatory automated coverage, not optional.

**Organization**: Tasks are grouped by user story (from spec.md, in priority order P1 → P2) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- File paths follow the single-Next.js-project structure from plan.md (`app/`, `components/`, `lib/`, `tests/`, `prisma/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create Next.js 14 (App Router) + TypeScript project skeleton per plan.md structure (`app/`, `components/`, `lib/`, `tests/`, `prisma/`) at repository root
- [X] T002 [P] Configure Tailwind CSS and initialize shadcn/ui (`components.json`, `lib/utils.ts`) in the project root
- [X] T003 [P] Add base shadcn/ui components (Button, Card, Badge, Alert, Dialog, Progress) via the shadcn CLI into `components/ui/`
- [X] T004 [P] Configure ESLint + Prettier for TypeScript/Next.js in `.eslintrc.json` / `.prettierrc`
- [X] T005 [P] Configure Vitest for unit/integration/contract tests in `vitest.config.ts`
- [X] T006 [P] Configure Playwright for e2e tests in `playwright.config.ts`
- [X] T007 [P] Initialize Prisma with a PostgreSQL datasource in `prisma/schema.prisma`, and add `.env.example` with `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `INNGEST_EVENT_KEY` placeholders
- [X] T008 [P] Scaffold the Inngest client and Next.js route bridge in `lib/jobs/client.ts` and `app/api/inngest/route.ts`
- [X] T009 Define the shared response-envelope type (`status`, `message`, `isFunEstimate`, `data`) in `lib/api/envelope.ts` per `contracts/api.md`

**Checkpoint**: Tooling and project skeleton ready for foundational work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure — data model, provider interfaces, upload/storage pipeline shell — that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T010 Define all Prisma entities and enums in `prisma/schema.prisma`: `UserProfile`; `DietaryRestriction` (`type` enum `gluten_free | vegetarian | vegan | nut_allergy | shellfish_allergy | avoid_pork`, "duplicates for the same user/type are rejected"); `MealLogEntry` (`status` enum `identified | needs_confirmation | rejected_non_food | rejected_low_quality | rejected_invalid_file | empty_plate`, "If status is rejected_*, foodItems MUST be empty and no real nutrition values are persisted", `isFunEstimate` boolean excluded from aggregates "by construction"); `FoodItem` (`identificationStatus` enum `confirmed | pending_user_confirmation`, `dataSource` enum `visual_estimate | packaged_label | restaurant_data`); `AllergenLabel` (`allergen` enum `shellfish | peanuts | tree_nuts | pork`, extensible); `DietaryConflictFlag` (`reason` enum `conflict_detected | cannot_verify`, `confirmedByUser` boolean "Must be true before the item counts toward logged/consumed totals"); `ConsumptionRecord` (`method` enum `manual_fraction | per_item | photo_comparison`, `consumedFraction` float 0–1)
- [ ] T011 Run the initial Prisma migration (`npx prisma migrate dev --name init`) and generate the client — **blocked in this environment**: no live PostgreSQL instance is available; `npx prisma generate` was run successfully (schema validated, client generated), but `migrate dev` requires a real `DATABASE_URL`. Run this manually once a database is provisioned.
- [X] T012 [P] Define the `PortionEstimate` value-object type in `lib/models/portion-estimate.ts` (`amount`, `rangeMin`, `rangeMax`, `unit`, `isApproximate` — "MUST be labeled approximate (a range, not a point value) whenever the source estimation had ambiguous scale references... or hidden ingredients"; `portionConfidenceWarning` — "Set when portion size could not be reliably determined at all")
- [X] T013 [P] Define the `NutritionEstimate` value-object type in `lib/models/nutrition-estimate.ts` (`calories`, `proteinG`, `carbsG`, `fatG`, `micronutrients: Map<string, number>`, `isApproximate`, `uncertaintyReason`)
- [X] T014 [P] Define shared Zod request/response schemas for the scans, food-items, consumption, and dietary-restrictions endpoints in `lib/api/schemas.ts` matching `contracts/api.md`
- [X] T015 Implement upload validation utility in `lib/services/ingestion/validate-upload.ts` (jpeg/png/webp allow-list, max size check; rejects invalid/corrupted files per FR-014 without throwing unhandled exceptions)
- [X] T016 Implement the Vercel Blob storage client wrapper in `lib/services/ingestion/photo-storage.ts` (upload, get URL) with explicit error handling for storage failures (constitution I)
- [X] T017 Define the `FoodVisionProvider` interface and a fixture-based stub adapter in `lib/services/vision/provider.ts` and `lib/services/vision/stub-adapter.ts` (candidate items, per-item confidence, bounding regions, portion estimate/range, content classification), with explicit timeout/failure handling
- [X] T018 Define the `RestaurantNutritionProvider` interface and an offline-aware stub adapter in `lib/services/nutrition/restaurant-provider.ts`
- [X] T019 Implement the `POST /api/v1/scans` route-handler skeleton in `app/api/v1/scans/route.ts`: validates upload (T015), stores the photo (T016), dispatches an Inngest job, and returns `202` with a `jobId` per `contracts/api.md`
- [X] T020 Implement the Inngest scan-processing job skeleton in `lib/jobs/process-scan.ts` that invokes the vision-pipeline stages (quality check → content classification → food identification) and persists `MealLogEntry`/`FoodItem` records via Prisma
- [X] T021 Implement `GET /api/v1/scans/{jobId}` in `app/api/v1/scans/[jobId]/route.ts`, returning job status/result in the shared envelope
- [X] T022 Implement centralized error-handling/logging middleware in `lib/api/error-handler.ts` so no route ever returns a bare stack trace (constitution III) and every external-call failure is logged with technical detail server-side (constitution I)
- [X] T023 [P] Implement the app shell/navigation and root layout with shadcn/ui in `app/layout.tsx` and `components/nav.tsx`, evolving `mockup/`'s visual direction
- [X] T024 [P] Implement reusable scan-result envelope primitives (status banner, data-source badge, approximate/range label) in `components/meal/scan-result-envelope.tsx` matching the shared response envelope

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Identify foods and estimate nutrition from a photo (Priority: P1) 🎯 MVP

**Goal**: A user takes or uploads a clear photo of a meal and receives calorie/macro/micronutrient data without manual entry, for both single-item and multi-item plates.

**Independent Test**: Upload a clear single-food photo and a clear multi-item-plate photo; verify per-item and combined nutrition data is returned within 5 seconds.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T025 [P] [US1] Contract test for `POST /api/v1/scans` with the clear single-food fixture in `tests/contract/scans.single-food.test.ts`
- [X] T026 [P] [US1] Contract test for `POST /api/v1/scans` with the multi-item-plate fixture in `tests/contract/scans.multi-item.test.ts`
- [X] T027 [P] [US1] Integration test: scan-to-result completes within 5 seconds for a single-food photo in `tests/integration/scan-single-food.test.ts` (SC-001)
- [X] T028 [P] [US1] Integration test: multi-item plate returns per-item macros/micronutrients plus a combined total in `tests/integration/scan-multi-item.test.ts`
- [X] T029 [P] [US1] Integration test: a very large portion is estimated at its actual size, not defaulted to a standard serving in `tests/integration/scan-large-portion.test.ts` (FR-005)

### Implementation for User Story 1

- [X] T030 [US1] Implement the USDA FoodData Central client for generic-food nutrition lookup in `lib/services/nutrition/usda-provider.ts`, with explicit failure/timeout handling
- [X] T031 [US1] Implement the nutrition-calculation service combining vision output + USDA lookup into `FoodItem`/`NutritionEstimate` records in `lib/services/nutrition/calculate-nutrition.ts` (depends on T030, T017)
- [X] T032 [US1] Implement portion-size estimation in `lib/services/vision/estimate-portion.ts`, returning an exact `amount` when a confident scale reference exists rather than defaulting to a standard serving (FR-005) (depends on T017)
- [X] T033 [US1] Wire food-identification + nutrition-calculation stages into `lib/jobs/process-scan.ts` (depends on T020, T031, T032)
- [X] T034 [US1] Implement the camera-capture + file-upload UI component in `components/meal/scan-upload.tsx`, requesting camera permission only when the camera is used and allowing upload without it (FR-028)
- [X] T035 [US1] Implement the scan page with job-completion polling in `app/scan/page.tsx` (depends on T019, T021, T034)
- [X] T036 [US1] Implement the per-item and combined-total result display (calories, protein, carbs, fat, micronutrients) in `components/meal/scan-result-card.tsx` (depends on T024)
- [X] T037 [US1] Add p95 latency instrumentation/logging for the scan pipeline in `lib/jobs/process-scan.ts` and `app/api/v1/scans/route.ts` (SC-001, constitution IV)

**Checkpoint**: User Story 1 is fully functional and independently testable — MVP.

---

## Phase 4: User Story 2 - Be honest about uncertainty and bad input, with a lighthearted tone (Priority: P1)

**Goal**: Non-food, blurry, empty-plate, ambiguous-portion, hidden-ingredient, visually-similar, and invalid/corrupted-file submissions all get a friendly, honest, non-fabricated response.

**Independent Test**: Submit each known problematic image (non-food, blurry, empty plate, ambiguous portion, hidden ingredients, visually-similar food, invalid file, corrupted file) and verify the correct response category with no fabricated nutrition data.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T038 [P] [US2] Contract test for `POST /api/v1/scans` with the non-food fixture in `tests/contract/scans.non-food.test.ts`
- [X] T039 [P] [US2] Contract test for `POST /api/v1/scans` with the blurry fixture in `tests/contract/scans.blurry.test.ts`
- [X] T040 [P] [US2] Contract test for `POST /api/v1/scans` with invalid-file-type and corrupted-image fixtures in `tests/contract/scans.invalid-file.test.ts`
- [X] T041 [P] [US2] Integration test: empty-plate photo yields 0 calories and a lighthearted message in `tests/integration/scan-empty-plate.test.ts`
- [X] T042 [P] [US2] Integration test: ambiguous-portion photo returns a labeled-approximate range, reasonably consistent across angles/distances or explicitly warns otherwise in `tests/integration/scan-ambiguous-portion.test.ts` (FR-010, FR-011)
- [X] T043 [P] [US2] Integration test: hidden-ingredient dish discloses an estimate plus uncertainty reason in `tests/integration/scan-hidden-ingredients.test.ts` (FR-012)
- [X] T044 [P] [US2] Integration test: visually-similar-food photo returns `needs_confirmation` with a confidence indicator, excluded from totals until confirmed in `tests/integration/scan-visually-similar.test.ts` (FR-013)

### Implementation for User Story 2

- [X] T045 [US2] Implement the image-quality (blur/lighting) check stage in `lib/services/ingestion/quality-check.ts` as a distinct step run before content classification (domain gate)
- [X] T046 [US2] Implement the non-food/empty-plate content-classification stage in `lib/services/vision/content-classification.ts`, distinct from quality-check and food-identification (domain gate)
- [X] T047 [US2] Implement the "just for fun" estimate generator for non-food images in `lib/services/vision/fun-estimate.ts`, clearly labeled and excluded from `combinedNutritionTotals` ("MUST NOT contribute to combinedNutritionTotals or daily totals")
- [X] T048 [US2] Wire quality-check + content-classification into `lib/jobs/process-scan.ts`, setting `MealLogEntry.status` to `rejected_low_quality` / `rejected_non_food` / `empty_plate` per the state-transition diagram in data-model.md (depends on T045, T046, T047, T033)
- [X] T049 [US2] Implement the invalid-file/corrupted-file rejection path in `app/api/v1/scans/route.ts`, returning `status: rejected_invalid_file` with a friendly, actionable message and never a 500 (FR-014) (depends on T015)
- [X] T050 [US2] Implement hidden-ingredient / ambiguous-portion uncertainty disclosure in `lib/services/nutrition/calculate-nutrition.ts`, setting `NutritionEstimate.isApproximate` and `uncertaintyReason` (FR-010, FR-012) (depends on T031, T032)
- [X] T051 [US2] Implement `PATCH /api/v1/meal-log-entries/{id}/food-items/{foodItemId}` in `app/api/v1/meal-log-entries/[id]/food-items/[foodItemId]/route.ts`, recalculating nutrition on confirmation/correction (FR-013, FR-027)
- [X] T052 [US2] Implement the confirm/correct dialog for visually-similar or pending food items in `components/meal/confirm-food-item-dialog.tsx` (depends on T024, T051)
- [X] T053 [US2] Implement shared friendly/playful status messages for each rejection/uncertainty case in `lib/api/messages.ts`, reused by API responses and UI (constitution III)
- [X] T054 [US2] Update the scan-result UI to render rejected/empty-plate/approximate-range/fun-estimate states via the shared envelope components in `components/meal/scan-result-card.tsx` (depends on T024, T036, T053)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Allergens and dietary restrictions (Priority: P1)

**Goal**: Every result explicitly labels common allergens/pork, and identified foods are checked against saved restrictions, flagging unverifiable/conflicting items for confirmation.

**Independent Test**: Submit photos of allergen-containing foods (with and without a restriction on file) and an ambiguous-compliance food (e.g., a muffin for a gluten-free user); verify labels and confirmation prompts.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T055 [P] [US3] Contract test for `GET`/`PUT /api/v1/users/{id}/dietary-restrictions` in `tests/contract/dietary-restrictions.test.ts`
- [X] T056 [P] [US3] Integration test: allergen label present regardless of restrictions on file in `tests/integration/allergen-always-labeled.test.ts` (SC-003)
- [X] T057 [P] [US3] Integration test: unverifiable-restriction food flags a conflict and blocks logging until confirmed in `tests/integration/dietary-conflict.test.ts` (FR-017, FR-018)

### Implementation for User Story 3

- [X] T058 [US3] Implement the allergen-labeling service in `lib/services/restrictions/allergen-labeling.ts`, always populating `AllergenLabel[]` "regardless of whether the user has a related restriction on file" (FR-015)
- [X] T059 [US3] Implement `GET`/`PUT /api/v1/users/{id}/dietary-restrictions` in `app/api/v1/users/[id]/dietary-restrictions/route.ts`, rejecting duplicate `type` values per user
- [X] T060 [US3] Implement the conflict-detection service in `lib/services/restrictions/conflict-detection.ts`, creating a `DietaryConflictFlag` with reason `conflict_detected` or `cannot_verify` and never assuming compliance from appearance alone (FR-017)
- [X] T061 [US3] Wire allergen-labeling + conflict-detection into `lib/jobs/process-scan.ts` so every `FoodItem` gets labels/flags before `MealLogEntry.status` can become `identified` (depends on T058, T060, T033)
- [X] T062 [US3] Extend the food-items `PATCH` handler to accept `resolveConflicts` and require `confirmedByUser: true` before the item "counts toward logged/consumed totals" (depends on T051, T060)
- [X] T063 [US3] Implement the dietary-restrictions profile management UI in `app/profile/page.tsx` and `components/meal/restriction-list.tsx` (depends on T059)
- [X] T064 [US3] Implement the allergen badge and conflict-flag confirmation UI in `components/meal/allergen-badge.tsx` and `components/meal/conflict-confirm-dialog.tsx` (depends on T024, T062)

**Checkpoint**: All P1 stories (US1, US2, US3) are independently functional — full P1 MVP.

---

## Phase 6: User Story 4 - Track how much of the meal was actually eaten (Priority: P2)

**Goal**: Users record consumption manually (whole-meal fraction), per-item, or via before/after photo comparison, and totals recalculate accordingly.

**Independent Test**: Log a meal, then set a consumption fraction manually, per-item, and via a second photo; verify consumed nutrition scales correctly in each case.

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T065 [P] [US4] Contract test for `POST /api/v1/meal-log-entries/{id}/consumption` (manual + per-item) in `tests/contract/consumption.test.ts`
- [X] T066 [P] [US4] Contract test for `POST /api/v1/meal-log-entries/{id}/consumption/photo-diff` in `tests/contract/consumption-photo-diff.test.ts`
- [X] T067 [P] [US4] Integration test: manual 100%/50%/25%/0% consumption scales all nutrients within tolerance in `tests/integration/consumption-manual.test.ts` (FR-019, SC-004 "within a 5% tolerance across all nutrients")
- [X] T068 [P] [US4] Integration test: per-item consumption recalculates meal totals from per-item amounts in `tests/integration/consumption-per-item.test.ts` (FR-020)
- [X] T069 [P] [US4] Integration test: before/after photo diff reports the consumed estimate and never assumes 100% consumption unless the after-photo shows an empty plate in `tests/integration/consumption-photo-diff.test.ts` (FR-021)
- [X] T070 [P] [US4] Integration test: removed-but-not-eaten food requires confirmation, and added food is treated as an addition rather than a consumption change in `tests/integration/consumption-removed-vs-added.test.ts` (FR-022, FR-023)

### Implementation for User Story 4

- [X] T071 [US4] Implement the consumption calculation service in `lib/services/consumption/scale-nutrition.ts`, applying `consumedFraction` "to every nutrient field in the associated NutritionEstimate, not just calories" (FR-019)
- [X] T072 [US4] Implement `POST /api/v1/meal-log-entries/{id}/consumption` in `app/api/v1/meal-log-entries/[id]/consumption/route.ts`, supporting `manual_fraction` and `per_item` methods (depends on T071)
- [X] T073 [US4] Implement the before/after photo-diff comparison service in `lib/services/consumption/photo-diff.ts`, re-running the vision pipeline on the after-photo and matching food identity to compute consumed/removed/added deltas (FR-021, FR-022, FR-023)
- [X] T074 [US4] Implement `POST /api/v1/meal-log-entries/{id}/consumption/photo-diff` in `app/api/v1/meal-log-entries/[id]/consumption/photo-diff/route.ts`, setting `requiresUserConfirmation: true` when `removalSuspected` (depends on T073)
- [X] T075 [US4] Implement the removal/added-food confirmation flow in `lib/services/consumption/confirm-removal.ts` and wire it into the food-items `PATCH` handler (depends on T074, T051)
- [X] T076 [US4] Implement consumption UI controls (whole-meal % selector, per-item sliders, after-photo capture) in `components/meal/consumption-controls.tsx` (depends on T024)
- [X] T077 [US4] Implement the meal-detail page showing consumption state and recalculated totals in `app/meals/[id]/page.tsx` (depends on T072, T076)

**Checkpoint**: User Stories 1–4 are all independently functional.

---

## Phase 7: User Story 5 - Prefer authoritative nutrition data over visual guesses (Priority: P2)

**Goal**: Packaged foods with a readable barcode/label and recognized restaurant items (when online) use published nutrition facts instead of a visual estimate, with the data source disclosed.

**Independent Test**: Submit a packaged-barcode photo and a restaurant-item photo (online); verify displayed nutrition matches the published source and the source is disclosed.

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T078 [P] [US5] Contract test: packaged-barcode fixture returns `dataSource: packaged_label` in `tests/contract/scans.packaged-barcode.test.ts`
- [X] T079 [P] [US5] Contract test: restaurant-item fixture returns `dataSource: restaurant_data` when online in `tests/contract/scans.restaurant-online.test.ts`
- [X] T080 [P] [US5] Integration test: restaurant-item fixture falls back to `visual_estimate` with a disclosure when offline in `tests/integration/scan-restaurant-offline.test.ts` (FR-026)

### Implementation for User Story 5

- [X] T081 [US5] Implement the Open Food Facts barcode/label lookup client in `lib/services/nutrition/open-food-facts-provider.ts`, falling back to visual estimation only when no match or unreadable label is found (FR-024)
- [X] T082 [US5] Implement the restaurant-data lookup via `RestaurantNutritionProvider` (online-only) in `lib/services/nutrition/restaurant-provider.ts`, checking network availability before calling (depends on T018)
- [X] T083 [US5] Implement data-source selection logic in `lib/services/nutrition/select-source.ts`: `packaged_label` → `restaurant_data` → `visual_estimate` precedence, always setting `FoodItem.dataSource` (FR-024, FR-025, FR-026)
- [X] T084 [US5] Wire source-selection into `lib/jobs/process-scan.ts` ahead of nutrition calculation (depends on T083, T033)
- [X] T085 [US5] Display the data-source disclosure badge on scan results in `components/meal/data-source-badge.tsx` (depends on T024, T036)

**Checkpoint**: All user stories (US1–US5) are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T086 [P] Run and validate all 16 scenarios in `quickstart.md` end-to-end
- [X] T087 [P] Add a Playwright e2e test for the full scan → confirm → consumption flow in `tests/e2e/scan-to-log.spec.ts`
- [X] T088 [P] Security review: confirm all upload/storage/provider calls sanitize input and enforce file-type/size limits per OWASP guidance, across `lib/services/ingestion/`
- [X] T089 [P] Performance pass: verify p95 ≤ 5s under load and Inngest job progress feedback for any step > 2s (SC-001, constitution IV)
- [X] T090 [P] Update `README.md` with setup/run instructions matching `quickstart.md`
- [X] T091 Code-cleanup and refactor pass across `lib/services/` for consistent error handling (constitution I)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational phase completion
  - US1 (P1) has no dependency on other stories
  - US2 (P1) reuses the pipeline scaffold from Foundational/US1 (`lib/jobs/process-scan.ts`) but is independently testable via its own fixtures
  - US3 (P1) reuses the same pipeline scaffold; independently testable via allergen/restriction fixtures
  - US4 (P2) depends on a `MealLogEntry` existing (from US1) but adds its own endpoints/services
  - US5 (P2) extends the nutrition-calculation step from US1 with source selection; independently testable via barcode/restaurant fixtures
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models/types before services
- Services before route handlers
- Route handlers before UI
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (T012–T014, T023–T024)
- Once Foundational completes, US1, US2, US3 can be staffed in parallel (all P1); US4/US5 can start once US1's pipeline scaffold exists
- All tests marked [P] within a story can run in parallel
- Different user stories can be worked on in parallel by different team members, understanding that US2/US3/US5 all touch `lib/jobs/process-scan.ts` and should be sequenced or carefully merged if worked on simultaneously

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Contract test for POST /api/v1/scans single-food fixture in tests/contract/scans.single-food.test.ts"
Task: "Contract test for POST /api/v1/scans multi-item fixture in tests/contract/scans.multi-item.test.ts"
Task: "Integration test: scan-to-result within 5s in tests/integration/scan-single-food.test.ts"
Task: "Integration test: multi-item combined totals in tests/integration/scan-multi-item.test.ts"
Task: "Integration test: large portion not defaulted in tests/integration/scan-large-portion.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run quickstart.md scenarios 1–2 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → validate → deploy (MVP!)
3. Add US2 → validate honesty/uncertainty scenarios → deploy
4. Add US3 → validate allergen/restriction scenarios → deploy (completes full P1 scope)
5. Add US4 → validate consumption-tracking scenarios → deploy
6. Add US5 → validate authoritative-source scenarios → deploy
7. Polish phase → final quickstart.md full run

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (MVP path)
   - Developer B: US2 (once US1's `process-scan.ts` scaffold — T020/T033 — exists)
   - Developer C: US3 (once the same scaffold exists)
3. US4/US5 picked up by whoever finishes first, after US1 lands

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2, US3, and US5 implementation tasks all touch the shared `lib/jobs/process-scan.ts` pipeline file — coordinate merges to avoid conflicts
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
