import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { calculateNutrition } from "@/lib/services/nutrition/calculate-nutrition";
import { estimatePortion } from "@/lib/services/vision/estimate-portion";

describe("Scan — ambiguous portion (FR-010, FR-011)", () => {
  it("labels the result as approximate with a range, consistently across repeated scans", async () => {
    const provider = new StubFoodVisionProvider();

    const first = await provider.analyze("fixtures/ambiguous-portion-angle1.jpg");
    const second = await provider.analyze("fixtures/ambiguous-portion-angle2.jpg");

    const firstPortion = estimatePortion(first.foodCandidates[0]);
    const secondPortion = estimatePortion(second.foodCandidates[0]);

    expect(firstPortion.isApproximate).toBe(true);
    expect(secondPortion.isApproximate).toBe(true);
    expect(firstPortion.rangeMin).toEqual(secondPortion.rangeMin);
    expect(firstPortion.rangeMax).toEqual(secondPortion.rangeMax);

    const nutrition = await calculateNutrition(first.foodCandidates[0], firstPortion);
    expect(nutrition.isApproximate).toBe(true);
  });
});
