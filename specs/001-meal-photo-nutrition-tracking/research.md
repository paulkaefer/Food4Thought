# Research: Meal Photo Nutrition Tracking

## 1. Food/vision recognition approach

- **Decision**: Access food recognition and portion estimation through an internal `FoodVisionProvider` interface (single method: photo(s) + context in, structured `VisionResult` out: candidate food items, per-item confidence, bounding regions, portion estimate/range, content classification). The concrete vendor/model behind the interface is a deployment-time configuration choice.
- **Rationale**: No specific vendor was mandated by the feature request. An interface boundary keeps the vision provider swappable (constitution I: single responsibility, isolated failure) and lets contract tests run against recorded fixtures instead of a live third-party dependency.
- **Alternatives considered**: Building a custom in-house model (rejected for MVP — far higher cost/time with no accuracy guarantee over existing commercial food-recognition APIs); hardcoding a single named vendor (rejected — creates vendor lock-in not requested by the spec and complicates contract testing).

## 2. Non-food / image-quality detection

- **Decision**: Treat "content classification" (food vs. non-food vs. empty-plate) and "quality check" (blur/lighting sufficiency) as two distinct pipeline stages that run before food identification, each returning its own pass/fail + confidence, consistent with the constitution's domain gate.
- **Rationale**: Spec requires distinguishing non-food, blurry, and empty-plate cases with different messages (User Story 2). Separating these stages lets each be unit- and contract-tested independently and prevents a low-confidence vision call from being misreported as "no food" when the real cause is image quality.
- **Alternatives considered**: A single combined "confidence score" from the vision provider (rejected — can't distinguish "blurry" from "not food" from "empty plate," which the spec requires to be messaged differently).

## 3. Generic nutrition data source

- **Decision**: Use USDA FoodData Central (public, free, well-documented) as the default generic-food nutrition source for visually-estimated items (macros + micronutrients).
- **Rationale**: Public, no licensing cost, broad coverage of whole/generic foods, stable API — suitable as an MVP default consistent with "authoritative data over visual guesses" (User Story 5) for the generic-food tier.
- **Alternatives considered**: Proprietary nutrition databases (rejected for MVP — cost/licensing overhead not justified until product-market fit); building an in-house nutrient table (rejected — duplicates well-maintained public data).

## 4. Packaged food (barcode/label) lookup

- **Decision**: Use Open Food Facts for barcode/label-based lookup, falling back to visual estimation when no match is found or the barcode/label isn't readable (FR-024).
- **Rationale**: Open Food Facts is a free, large, community-maintained packaged-food database with barcode lookup, matching the "use manufacturer's published facts when available" requirement without a paid contract for MVP.
- **Alternatives considered**: Paid barcode/nutrition APIs (deferred — can be swapped in later behind the same provider interface without spec changes).

## 5. Restaurant nutrition data

- **Decision**: Access restaurant nutrition data through an internal `RestaurantNutritionProvider` interface, used only when the app is online (FR-025/FR-026); concrete vendor is a deployment-time configuration choice, mirroring the vision-provider pattern.
- **Rationale**: Spec requires disclosing the data source and falling back to visual estimation offline; an interface boundary lets this be contract-tested with fixtures and avoids committing to one commercial restaurant-data vendor in the spec/plan layer.
- **Alternatives considered**: Skipping restaurant-source disclosure and always visually estimating (rejected — explicitly required by FR-025).

## 6. Portion-size estimation & consistency

- **Decision**: Portion estimation returns either an exact amount (when scale references like a plate/hand/utensil are detected) or a `{min, max}` range labeled "approximate" (FR-010); the same estimation function is used regardless of angle/distance so repeated scans of the same real portion query the same underlying scale-reference logic (FR-011), and a low-confidence scale-reference result surfaces a "can't reliably determine portion size" warning instead of a silently narrow range.
- **Rationale**: Directly satisfies FR-005/FR-010/FR-011 without inventing new UX beyond what's specified.
- **Alternatives considered**: Always defaulting to standard serving sizes (explicitly rejected by FR-005).

## 7. Before/after photo consumption comparison

- **Decision**: Compare "before" and "after" photos via the same vision pipeline (re-running content classification + food identification on the after-photo), then diff identified items/portions by matching food identity: items with reduced portion and no plausible "removed" signal are treated as consumed; items missing entirely are flagged for user confirmation (removed vs. eaten) per FR-022; items newly present are treated as added food per FR-023.
- **Rationale**: Reuses existing vision pipeline rather than introducing a separate model, keeping the domain gate (no fabricated data) intact by asking the user to confirm ambiguous cases instead of guessing.
- **Alternatives considered**: Always assuming portion reduction = consumption (explicitly rejected by FR-021/FR-022).

## 8. Frontend platform

- **Decision**: Next.js 14 (App Router) with shadcn/ui + Tailwind CSS, deployed on Vercel, evolving the existing static `mockup/`; route handlers under `app/api/` implement the REST contract directly so there is no separate backend service. Camera/upload uses standard browser APIs (`getUserMedia`, `<input type=file>`); no native mobile app in this iteration.
- **Rationale**: A single deployable simplifies the MVP versus a split SPA + standalone API service. shadcn/ui's accessible, themeable primitives (Alert, Badge, Card, Dialog, Progress) map directly onto the shared response envelope (allergen badges, conflict dialogs, approximate-range labels, upload progress), directly serving constitution III (UX consistency) without a hand-rolled design system. Vercel is a natural fit for a Next.js app and matches the "responsive web app" target platform.
- **Alternatives considered**: Separate React SPA + standalone Fastify API (rejected — two deployables and duplicate routing/validation layers for no added benefit at this scale); native iOS/Android app (deferred — larger scope than requested, no platform was specified by the user).

## 9. Data storage

- **Decision**: PostgreSQL via Vercel Postgres/Neon for relational data (profiles, restrictions, meal logs, food items, consumption records) via Prisma; Vercel Blob for photos (original + before/after pairs), referenced by URL/key from the relational rows.
- **Rationale**: Standard, well-supported choice for structured relational data with clear entity relationships (see data-model.md); Vercel Blob is the conventional pattern for binary photo assets on Vercel, keeping the database lean and avoiding a separate S3 account/config for MVP.
- **Alternatives considered**: Storing photos as DB blobs (rejected — poor scalability/performance for image assets); self-managed S3 (deferred — Vercel Blob is simpler to wire up for a Vercel-hosted app; can be swapped later since photo storage is accessed through a single internal module).

## 10. Testing strategy

- **Decision**: Contract tests per external provider (vision, USDA, Open Food Facts, restaurant) using recorded fixtures; integration tests mapped one-to-one to each spec edge case (non-food, blurry, empty plate, ambiguous portion, hidden ingredients, visually-similar foods, invalid file type, corrupted file, allergen/restriction conflict, consumption tracking variants, offline fallback); unit tests for pure calculation logic (proportional scaling, range/approximate labeling); Playwright e2e for the primary scan-to-log user flow.
- **Rationale**: Directly required by constitution II (NON-NEGOTIABLE) which names these exact edge cases as mandatory coverage.
- **Alternatives considered**: Relying on manual QA for edge cases (explicitly disallowed by the constitution).

## 11. Long-running pipeline steps on a serverless host

- **Decision**: Any pipeline step that may exceed Vercel's serverless function execution limit (vision-provider calls, before/after photo diffing) runs as an Inngest background job, triggered from the route handler; the route handler returns immediately with a job id, and the client polls/subscribes for the result (constitution IV: async processing with progress feedback for steps >2s).
- **Rationale**: Moving from a long-lived Fastify server to Vercel's serverless model removes the option of an in-process "just wait and stream progress" server; a durable background job runner (Inngest) is the standard pattern for this on Vercel and keeps route handlers fast and stateless.
- **Alternatives considered**: Doing everything synchronously inside the route handler (rejected — risks timeouts on slower vision-provider calls and violates the async/progress-feedback requirement); a self-hosted queue/worker (deferred — more ops overhead than needed for MVP scale).

All `NEEDS CLARIFICATION` items from Technical Context are resolved above.
