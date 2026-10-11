import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { estimatePortion } from "@/lib/services/vision/estimate-portion";
import { calculateNutrition } from "@/lib/services/nutrition/calculate-nutrition";

describe("Scan-to-result — single-food photo (SC-001)", () => {
  it("completes within the 5s budget and discloses unavailable USDA data", async () => {
    const provider = new StubFoodVisionProvider();
    const started = Date.now();

    const vision = await provider.analyze("fixtures/single-food-apple.jpg");
    const candidate = vision.foodCandidates[0];
    const nutrition = await calculateNutrition(candidate, estimatePortion(candidate));

    expect(Date.now() - started).toBeLessThan(5000);
    expect(nutrition.calories).toBe(0);
    expect(nutrition.isApproximate).toBe(true);
    expect(nutrition.uncertaintyReason).toMatch(/no verified USDA match/i);
    expect(nutrition.proteinG).toBeGreaterThanOrEqual(0);
    expect(nutrition.carbsG).toBeGreaterThanOrEqual(0);
    expect(nutrition.fatG).toBeGreaterThanOrEqual(0);
  });
});
