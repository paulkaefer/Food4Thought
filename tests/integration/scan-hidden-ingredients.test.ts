import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { calculateNutrition } from "@/lib/services/nutrition/calculate-nutrition";
import { estimatePortion } from "@/lib/services/vision/estimate-portion";

describe("Scan — hidden ingredients (FR-012)", () => {
  it("discloses an uncertainty reason referencing hidden/unclear ingredients", async () => {
    const provider = new StubFoodVisionProvider();
    const result = await provider.analyze("fixtures/hidden-ingredients-burger.jpg");
    const candidate = result.foodCandidates[0];

    expect(candidate.hasHiddenIngredients).toBe(true);

    const nutrition = await calculateNutrition(candidate, estimatePortion(candidate));
    expect(nutrition.isApproximate).toBe(true);
    expect(nutrition.uncertaintyReason).toMatch(/hidden|unclear|mystery/i);
  });
});
