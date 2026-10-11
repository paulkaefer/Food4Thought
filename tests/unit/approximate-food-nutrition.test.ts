import { describe, expect, it } from "vitest";
import { approximateFoodNutrition } from "@/lib/services/nutrition/approximate-food-nutrition";

describe("approximate food nutrition fallback", () => {
  it("provides cooked pasta reference nutrients", () => {
    expect(approximateFoodNutrition("Spaghetti pasta")).toMatchObject({
      calories: 158, isApproximate: true,
    });
  });

  it("estimates fresh basil without reporting zero calories", () => {
    const estimate = approximateFoodNutrition("Basil leaves");
    expect(estimate?.calories).toBeGreaterThan(0);
    expect(estimate?.uncertaintyReason).toContain("Generic");
  });

  it("offers an explicitly approximate generic cheese reference", () => {
    expect(approximateFoodNutrition("Grated cheese")).toMatchObject({
      calories: 390, isApproximate: true,
    });
  });

  it("covers tomato sauce and gnocchi", () => {
    expect(approximateFoodNutrition("tomato sauce")?.calories).toBeGreaterThan(0);
    expect(approximateFoodNutrition("gnocchi")?.calories).toBeGreaterThan(0);
  });

  it("does not invent nutrition for unidentified foods", () => {
    expect(approximateFoodNutrition("unknown food")).toBeNull();
  });
});
