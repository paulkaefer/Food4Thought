import { describe, expect, it } from "vitest";
import { scaleWholeMeal } from "@/lib/services/consumption/scale-nutrition";

describe("Manual consumption scaling (FR-019, SC-004)", () => {
  const meal = [{ calories: 600, proteinG: 40, carbsG: 60, fatG: 20, micronutrients: { vitaminC: 10 }, isApproximate: false, uncertaintyReason: null }];

  it("scales every nutrient to ~50% within a 5% tolerance", () => {
    const result = scaleWholeMeal(meal, 0.5);
    expect(result.calories).toBeCloseTo(300, 0);
    expect(result.proteinG).toBeCloseTo(20, 0);
    expect(result.micronutrients.vitaminC).toBeCloseTo(5, 0);
  });

  it("scales to 0 for 0% eaten", () => {
    const result = scaleWholeMeal(meal, 0);
    expect(result.calories).toBe(0);
  });

  it("leaves values unchanged for 100% eaten", () => {
    const result = scaleWholeMeal(meal, 1);
    expect(result.calories).toBe(600);
  });
});
