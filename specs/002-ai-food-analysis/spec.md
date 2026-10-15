# Feature Specification: Real AI Food Analysis

**Branch:** `feature/ai-food-analysis`
**Created:** 2026-10-08
**Status:** Draft — specification for fork implementation
**Upstream baseline:** `specs/001-meal-photo-nutrition-tracking/`
**Governance:** Food4Thought Constitution v1.1.0 and ADR-001

## Objective
Replace simulated food recognition with actual image analysis, while evolving the existing experience rather than replacing it. AI identifies food candidates and estimates portions; traceable nutrition sources provide nutrient reference values; deterministic code scales values by portions.

## User stories and acceptance criteria

### P1 — Analyze a real meal photograph
- Given a clear photograph of one or multiple foods, the system returns identified food candidates, estimated portion sizes or ranges, and an uncertainty indicator.
- Results reflect image contents, not filename or URL hints.
- Mixed dishes, occluded foods, poor lighting, and non-food inputs are handled without inventing certainty.

### P1 — Match to authoritative nutritional data
- Each identified food is matched to a relevant USDA FoodData Central record with source attribution and compatible units.
- Per-item and meal nutrient totals are computed by code from verified reference values and user-confirmed or estimated portions.
- A missing or ambiguous USDA match does not yield fabricated calories or macros; the UI asks for correction or displays unavailable values.
- The system does not silently select the first search result.

### P1 — Review and correct
- Users can correct food identity and portions, triggering nutrient rematching and recalculation.
- Uncertain ingredients and portions are explicitly flagged; no visual allergen guarantee is made.
- Processing, error, and correction flows remain recognizable extensions of the upstream UI.

### P1 — Provider safety and testability
- OpenAI credentials are never sent to the browser.
- The vision provider is configurable; deterministic stub behavior remains available for tests.
- Invalid provider output, API failures, timeouts, and rate limits produce actionable errors without fake nutrition results.

## Scope boundaries
- Preserve upstream architecture (Next.js, TypeScript, Prisma, Inngest and existing interfaces) until a documented ADR justifies change.
- Do not rewrite the UI wholesale; purposeful design evolution is allowed.
- This feature does not promise clinically accurate calorie or allergen assessment.
- Photo storage, privacy, operational cost limits, and public hosting require review before production rollout.

## Specification delta against 001
Upstream FR-026 and related fallback language permit visual nutrition estimates when data is unavailable. In this fork, unavailable nutrition reference data is represented as unavailable rather than invented numeric values. Estimated portions remain permissible, but must be labeled. Other upstream requirements remain in force unless explicitly amended.

## Validation scenarios
1. Single apple photo with matching USDA item and scaled portion.
2. Chicken, rice, and broccoli with independent USDA matches and combined total.
3. Visually ambiguous mash: user confirmation before final nutrition.
4. Mixed dish with hidden ingredients: visible uncertainty.
5. Blurry photo, empty plate, and non-food image: no fabricated nutrition.
6. USDA no-match, multiple competing matches, wrong serving basis, and API outage.
7. OpenAI timeout, malformed JSON, and rate limit.
8. User correction triggers recomputation, preserving source attribution.
9. Stub-based contract tests continue passing.

## Next SpecKit steps
Run clarification and plan workflows against this draft, then produce implementation tasks, acceptance tests, and a deployment decision before coding. Measure actual photo-to-result p95 against the upstream 5-second target; do not claim compliance without evidence.
