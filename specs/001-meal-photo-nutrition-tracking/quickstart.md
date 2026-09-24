# Quickstart: Validating Meal Photo Nutrition Tracking

## Prerequisites

- Next.js app running locally (`vercel dev` or `next dev`) with PostgreSQL (Vercel Postgres/Neon or local) and Vercel Blob (or local emulator) available.
- Inngest dev server running locally for background job execution (`npx inngest-cli dev`).
- Test fixture photos available (see `contracts/api.md` "Contract test fixtures required" list): clear single-food, clear multi-item plate, non-food, blurry, empty-plate, ambiguous-portion (2+ angles of same portion), hidden-ingredient dish, visually-similar-food pair, invalid file type, corrupted image, oversized file, packaged barcode food, restaurant item.
- A test user profile with at least one dietary restriction set (e.g., `gluten_free`) and one without any restrictions set.

## Setup

```powershell
# From repo root
npm install; npx prisma migrate dev; npm run dev
# In a second terminal, run the Inngest dev server
npx inngest-cli dev
```

## Validation Scenarios

Run each scenario below and confirm the expected outcome against `data-model.md` and `contracts/api.md`.

1. **Single-food identification** — Upload the clear single-food fixture via the scan flow.
   Expect: `status: identified`, macros + micronutrients shown, result within 5s (SC-001).

2. **Multi-item plate** — Upload the multi-item fixture.
   Expect: per-item macros/micronutrients plus a combined total; each item's `dataSource` disclosed.

3. **Non-food photo** — Upload the non-food fixture.
   Expect: `status: rejected_non_food`, friendly message, optional `funEstimate` clearly labeled and excluded from totals (SC-002).

4. **Blurry photo** — Upload the blurry fixture.
   Expect: `status: rejected_low_quality`, no nutrition data, retake/upload prompt.

5. **Empty plate** — Upload the empty-plate fixture.
   Expect: `status: empty_plate`, 0 calories, lighthearted message.

6. **Ambiguous portion** — Upload the same real portion from 2+ angles/distances.
   Expect: both results show a range labeled approximate, and the ranges are reasonably consistent with each other (or the app explicitly warns portion size can't be determined) (FR-011).

7. **Hidden ingredients** — Upload the hidden-ingredient dish fixture.
   Expect: nutrition marked approximate with an uncertainty reason referencing hidden/unclear ingredients.

8. **Visually similar foods** — Upload the visually-similar-food fixture.
   Expect: `status: needs_confirmation`, confidence shown, item excluded from totals until confirmed via `PATCH /food-items/{id}`.

9. **Invalid file / corrupted file** — Submit a PDF and a corrupted image.
   Expect: `status: rejected_invalid_file` for both, clear actionable message, HTTP 4xx (never 5xx), no crash.

10. **Allergens always labeled** — Scan any allergen-containing food with a user who has no restrictions set.
    Expect: allergen label still present on the result (SC-003).

11. **Restriction conflict** — Scan a food that conflicts with the test user's `gluten_free` restriction (e.g., a muffin).
    Expect: `DietaryConflictFlag` present, item not logged as consumed until confirmed via `PATCH`.

12. **Manual consumption** — Log a meal, then `POST /consumption` with `consumedFraction: 0.5`.
    Expect: all nutrient totals scale to ~50% within SC-004 tolerance.

13. **Per-item consumption** — `POST /consumption` with `method: per_item` setting different fractions per food item.
    Expect: meal totals recalculated from per-item amounts.

14. **Before/after photo diff** — Submit a before photo, then an after photo showing partial consumption.
    Expect: `POST /consumption/photo-diff` reports the consumed estimate; repeating with an after photo showing removed (not eaten) food sets `removalSuspected: true` and requires confirmation; repeating with an after photo showing added food sets `addedFoodDetected: true`.

15. **Packaged food barcode** — Scan the packaged-barcode fixture.
    Expect: `dataSource: packaged_label`, values match the fixture's published label.

16. **Restaurant item, online vs. offline** — Scan the restaurant-item fixture with network access, then simulate offline.
    Expect: online → `dataSource: restaurant_data` with source disclosed; offline → falls back to `visual_estimate` with a disclosure that restaurant lookup was unavailable.

## Success Check

All 16 scenarios produce the expected `status`/`dataSource`/flags with no server error and no fabricated nutrition data — this constitutes a passing quickstart validation for the feature.
