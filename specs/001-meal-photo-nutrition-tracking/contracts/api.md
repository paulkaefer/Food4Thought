# API Contract: Meal Photo Nutrition Tracking

Format: REST/JSON. All endpoints are versioned under `/api/v1`. All responses share a common envelope shape so success and every "honest failure" case (User Story 2) are visually/structurally consistent per constitution III.

## Common Response Envelope

```jsonc
{
  "status": "identified | needs_confirmation | rejected_non_food | rejected_low_quality | rejected_invalid_file | empty_plate",
  "message": "human-readable, friendly, always present",
  "isFunEstimate": false,
  "data": { /* present only for identified/needs_confirmation/empty_plate; omitted for rejected_* */ }
}
```

## POST /api/v1/scans

Submit a meal photo for identification and nutrition estimation.

**Request**: `multipart/form-data`
- `photo` (file, required): jpeg/png/webp, max size enforced client- and server-side (constitution IV)
- `mode` ("before" | "after" | "single", default "single")
- `linkedMealLogEntryId` (UUID, required when `mode = after`)

**Responses**:

- `201 Created` — envelope with `status: identified | needs_confirmation | empty_plate` and `data.mealLogEntry` (see data-model.md `MealLogEntry`).
- `422 Unprocessable Entity` — envelope with `status: rejected_low_quality` (blurry/poor lighting) — no `data`.
- `200 OK` — envelope with `status: rejected_non_food` — `data.funEstimate` optional (`{ label: "just for fun", calories, note }`), never included in totals.
- `400 Bad Request` — envelope with `status: rejected_invalid_file` — unsupported/corrupted file; message explains what went wrong and how to fix it (FR-014). MUST NOT return a 500 for malformed/corrupted input.
- `408 Request Timeout` / async job pattern — Since vision-provider calls may exceed Vercel's serverless function execution limit, this endpoint returns `202 Accepted` with a `jobId` immediately, dispatching the work to an Inngest background job; the client polls `GET /api/v1/scans/{jobId}` for progress/completion, so the UI can show progress beyond 2s (constitution IV).

**Contract test fixtures required**: clear single-food photo, clear multi-item plate, non-food photo, blurry photo, empty-plate photo, ambiguous-portion photo (multiple angles of the same real portion), hidden-ingredient dish photo, visually-similar-food photo pair, invalid file type, corrupted image file, oversized file, packaged food with barcode, restaurant item photo (online and offline).

## PATCH /api/v1/meal-log-entries/{id}/food-items/{foodItemId}

Confirm or correct an identified food item.

**Request**:
```jsonc
{ "confirmedName": "string, required", "resolveConflicts": ["dietaryConflictFlagId", ...] }
```

**Response**: `200 OK` — updated `FoodItem` with recalculated `NutritionEstimate` (FR-027) and any remaining unresolved `DietaryConflictFlag`s.

## POST /api/v1/meal-log-entries/{id}/consumption

Record consumption for a meal, either whole-meal or per-item.

**Request** (whole-meal):
```jsonc
{ "method": "manual_fraction", "consumedFraction": 0.5 }
```

**Request** (per-item):
```jsonc
{ "method": "per_item", "items": [ { "foodItemId": "uuid", "consumedFraction": 1.0 } ] }
```

**Response**: `200 OK` — recalculated `MealLogEntry.combinedNutritionTotals` reflecting the new consumption (FR-019/FR-020), scaled within the SC-004 tolerance.

## POST /api/v1/meal-log-entries/{id}/consumption/photo-diff

Attach an "after" photo (submitted via `POST /api/v1/scans?mode=after&linkedMealLogEntryId=...`) and receive the derived consumption diff.

**Response**: `200 OK`
```jsonc
{
  "consumedEstimate": { "calories": 300, "proteinG": 20, "...": "..." },
  "removalSuspected": false,
  "addedFoodDetected": false,
  "requiresUserConfirmation": false
}
```
When `removalSuspected` or ambiguity is detected, `requiresUserConfirmation: true` and no consumption is finalized until a follow-up `PATCH` confirms intent (FR-022).

## GET/PUT /api/v1/users/{id}/dietary-restrictions

Manage a user's saved dietary restrictions (FR-016). `GET` returns `[]` when none are set (edge case: no restrictions), and this MUST NOT suppress allergen labels on scan results (FR-015 applies regardless).

## Error Handling Contract

Every non-2xx response uses the same envelope shape (`status`, `message`) — no bare stack traces or generic "500 error" text is ever shown to the user (constitution III); server-side logs retain technical detail separately.
