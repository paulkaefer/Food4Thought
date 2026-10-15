# ADR-001: Real AI Vision with Traceable Nutrition Sources

**Status:** Accepted for fork implementation
**Date:** 2026-10-08
**Scope:** scottzastrow/Food4Thought fork only
**Origin:** Extends upstream Food4Thought provider-based architecture.

## Context
The original scan pipeline uses `StubFoodVisionProvider` and includes a USDA FoodData Central client. The fork aims to fulfill the existing photo-analysis experience with real image interpretation without discarding the original architecture. Visual estimation alone cannot establish exact ingredients, portions, or nutrient reference values.

## Decision
1. Implement `OpenAiFoodVisionProvider` behind the existing `FoodVisionProvider` contract, with OpenAI credentials server-side only.
2. Preserve `StubFoodVisionProvider` for deterministic tests and offline development; select implementation through configuration.
3. Use the AI result only for food candidate identification, portion estimates, and uncertainty signals. Validate its structured output before use.
4. Use USDA FoodData Central as the initial source for generic-food nutrient reference values. Future packaged-food and restaurant providers may use verified published nutrition data.
5. Match foods deliberately; never accept the first USDA search result without relevance and unit checks. Normalize values to a consistent mass basis before applying estimated portions in application code.
6. If no trustworthy match or portion is available, show missing/uncertain nutrition and request correction; never fabricate nutrient reference values.
7. Keep low-quality, non-food, and allergen/dietary-conflict handling visible. Visual inspection is not a safety verification for allergens.
8. Preserve the existing Next.js/Prisma/Inngest pipeline initially; document any later hosting or service substitutions separately.

## Consequences
- Additional API cost, latency, configuration, and error handling.
- Image inputs and outputs require privacy and retention review before public deployment.
- Tests must include recorded/deterministic fixtures, provider-contract validation, malformed output, rate limits, timeouts, mismatched USDA results, and uncertainty display.
- The original specification's visual-nutrition fallback clauses (notably FR-026) require a scoped amendment for the fork; do not silently reinterpret them.
- No changes are made to the upstream repository.

## Alternatives considered
- Keep the filename-based stub as production recognition: rejected; cannot analyze real photographs.
- Let AI generate all nutritional numbers: rejected; lacks traceable reference data.
- Rewrite the whole application: rejected; undermines upstream architectural intent.
