import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { estimatePortion } from "@/lib/services/vision/estimate-portion";
import { calculateNutrition } from "@/lib/services/nutrition/calculate-nutrition";
import { sumNutritionEstimates } from "@/lib/models/nutrition-estimate";

describe("Scan-to-result — multi-item plate", () => {
  it("returns per-item macros/micronutrients plus a combined total", async () => {
    const provider = new StubFoodVisionProvider();
    const vision = await provider.analyze("fixtures/multi-item-plate.jpg");

    const perItem = await Promise.all(
      vision.foodCandidates.map((c) => calculateNutrition(c, estimatePortion(c))),
    );
    const total = sumNutritionEstimates(perItem);

    expect(perItem).toHaveLength(3);
    expect(total.calories).toBeCloseTo(perItem.reduce((sum, n) => sum + n.calories, 0), 5);
  });
});
