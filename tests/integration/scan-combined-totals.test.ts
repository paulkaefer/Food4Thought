import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { estimatePortion } from "@/lib/services/vision/estimate-portion";
import { calculateNutrition } from "@/lib/services/nutrition/calculate-nutrition";
import {
  hasIncompleteTotals,
  isNutritionUnavailable,
  sumNutritionEstimates,
} from "@/lib/models/nutrition-estimate";

describe("Combined meal nutrition totals", () => {
  it("combines per-item macros into a labeled approximate meal total", async () => {
    const provider = new StubFoodVisionProvider();
    const vision = await provider.analyze("fixtures/multi-item-plate.jpg");

    const perItem = await Promise.all(
      vision.foodCandidates.map((c) => calculateNutrition(c, estimatePortion(c))),
    );
    const total = sumNutritionEstimates(perItem);

    expect(perItem).toHaveLength(3);
    // Every stub item resolves to a labeled estimate — no placeholder zeros on a full plate.
    for (const item of perItem) {
      expect(isNutritionUnavailable(item)).toBe(false);
      expect(item.calories).toBeGreaterThan(0);
    }
    expect(total.calories).toBeCloseTo(perItem.reduce((sum, n) => sum + n.calories, 0), 5);
    expect(total.proteinG).toBeCloseTo(perItem.reduce((sum, n) => sum + n.proteinG, 0), 5);
    expect(total.carbsG).toBeCloseTo(perItem.reduce((sum, n) => sum + n.carbsG, 0), 5);
    expect(total.fatG).toBeCloseTo(perItem.reduce((sum, n) => sum + n.fatG, 0), 5);
    expect(total.calories).toBeGreaterThan(0);
    expect(total.isApproximate).toBe(true);
    expect(hasIncompleteTotals(perItem)).toBe(false);
  });

  it("flags totals as incomplete when an ingredient is unavailable, without hiding available data", async () => {
    const provider = new StubFoodVisionProvider();
    const vision = await provider.analyze("fixtures/single-food-apple.jpg");
    const candidate = vision.foodCandidates[0];
    const apple = await calculateNutrition(candidate, estimatePortion(candidate));
    const unmatched = await calculateNutrition(
      { ...candidate, name: "zz unrecognized food" },
      estimatePortion(candidate),
    );

    expect(isNutritionUnavailable(apple)).toBe(false);
    expect(isNutritionUnavailable(unmatched)).toBe(true);

    const items = [apple, unmatched];
    const total = sumNutritionEstimates(items);

    expect(hasIncompleteTotals(items)).toBe(true);
    // The unmatched item contributes nothing, but available items are never zeroed out,
    // and nothing is invented to fill the gap.
    expect(total.calories).toBeCloseTo(apple.calories, 5);
    expect(total.calories).toBeGreaterThan(0);
    expect(total.isApproximate).toBe(true);
  });
});
