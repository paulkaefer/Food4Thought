import { describe, expect, it } from "vitest";
import { scaleMealConsumption } from "@/lib/services/consumption/scale-nutrition";

describe("Per-item consumption (FR-020)", () => {
  it("recalculates meal totals from per-item amounts", () => {
    const items = [
      { foodItemId: "chicken", consumedFraction: 1, nutrition: { calories: 300, proteinG: 30, carbsG: 0, fatG: 10, micronutrients: {}, isApproximate: false, uncertaintyReason: null } },
      { foodItemId: "rice", consumedFraction: 0.5, nutrition: { calories: 200, proteinG: 4, carbsG: 45, fatG: 1, micronutrients: {}, isApproximate: false, uncertaintyReason: null } },
      { foodItemId: "broccoli", consumedFraction: 0, nutrition: { calories: 50, proteinG: 4, carbsG: 10, fatG: 0, micronutrients: {}, isApproximate: false, uncertaintyReason: null } },
    ];

    const total = scaleMealConsumption(items);
    expect(total.calories).toBeCloseTo(300 + 100 + 0, 5);
  });
});
