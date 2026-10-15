import { describe, expect, it } from "vitest";
import {
  emptyNutritionEstimate,
  hasIncompleteTotals,
  isNutritionUnavailable,
  scaleNutritionEstimate,
  sumNutritionEstimates,
  type NutritionEstimate,
} from "@/lib/models/nutrition-estimate";

function estimate(partial: Partial<NutritionEstimate>): NutritionEstimate {
  return { ...emptyNutritionEstimate(), ...partial };
}

describe("sumNutritionEstimates", () => {
  it("sums macros and micronutrients across items", () => {
    const total = sumNutritionEstimates([
      estimate({ calories: 200, proteinG: 20, carbsG: 10, fatG: 5, micronutrients: { vitaminC: 10 } }),
      estimate({ calories: 100, proteinG: 5, carbsG: 15, fatG: 2, micronutrients: { vitaminC: 5, iron: 2 } }),
    ]);
    expect(total).toMatchObject({ calories: 300, proteinG: 25, carbsG: 25, fatG: 7 });
    expect(total.micronutrients).toEqual({ vitaminC: 15, iron: 2 });
  });

  it("marks the combined total approximate when any item is approximate", () => {
    const total = sumNutritionEstimates([estimate({}), estimate({ isApproximate: true })]);
    expect(total.isApproximate).toBe(true);
  });

  it("returns zeros for an empty meal", () => {
    expect(sumNutritionEstimates([])).toMatchObject({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(sumNutritionEstimates([]).isApproximate).toBe(false);
  });
});

describe("scaleNutritionEstimate", () => {
  it("scales every nutrient by the consumption fraction", () => {
    const scaled = scaleNutritionEstimate(
      estimate({ calories: 400, proteinG: 40, carbsG: 20, fatG: 10, micronutrients: { iron: 4 } }),
      0.5,
    );
    expect(scaled).toMatchObject({ calories: 200, proteinG: 20, carbsG: 10, fatG: 5 });
    expect(scaled.micronutrients.iron).toBe(2);
  });

  it("clamps the fraction to [0, 1]", () => {
    expect(scaleNutritionEstimate(estimate({ calories: 100 }), 1.5).calories).toBe(100);
    expect(scaleNutritionEstimate(estimate({ calories: 100 }), -0.5).calories).toBe(0);
  });
});

describe("isNutritionUnavailable", () => {
  it("detects placeholder-zero results for both unavailable message variants", () => {
    expect(
      isNutritionUnavailable(
        estimate({
          uncertaintyReason:
            "Nutrition unavailable: no verified USDA match. Zero values are placeholders, not measured nutrition; meal totals may be incomplete.",
        }),
      ),
    ).toBe(true);
    expect(
      isNutritionUnavailable(
        estimate({
          uncertaintyReason:
            "Hidden or unclear ingredients; nutrition unavailable without a verified USDA match. Zero values are placeholders, not measured nutrition.",
        }),
      ),
    ).toBe(true);
  });

  it("does not mislabel genuinely zero-valued reference nutrition (e.g. water)", () => {
    expect(
      isNutritionUnavailable(
        estimate({ uncertaintyReason: "USDA reference values; preparation and variety may differ." }),
      ),
    ).toBe(false);
  });

  it("distinguishes generic and broad category estimates from unavailable", () => {
    expect(
      isNutritionUnavailable(
        estimate({
          calories: 158,
          uncertaintyReason: "Generic food reference estimate; variety, ingredients and preparation may differ.",
        }),
      ),
    ).toBe(false);
    expect(
      isNutritionUnavailable(
        estimate({
          calories: 140,
          uncertaintyReason: "Broad cream-based sauce estimate; actual ingredients and preparation may differ substantially.",
        }),
      ),
    ).toBe(false);
  });

  it("treats a null reason as available data", () => {
    expect(isNutritionUnavailable(estimate({}))).toBe(false);
  });
});

describe("hasIncompleteTotals", () => {
  it("is true when any item is unavailable and false otherwise", () => {
    expect(
      hasIncompleteTotals([
        estimate({ calories: 200 }),
        estimate({ uncertaintyReason: "Nutrition unavailable: no verified USDA match." }),
      ]),
    ).toBe(true);
    expect(hasIncompleteTotals([estimate({ calories: 200 })])).toBe(false);
    expect(hasIncompleteTotals([])).toBe(false);
  });
});
