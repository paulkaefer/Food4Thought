import { beforeEach, describe, expect, it, vi } from "vitest";
import { isNutritionUnavailable, type NutritionEstimate } from "@/lib/models/nutrition-estimate";
import { approximatePortion, exactPortion } from "@/lib/models/portion-estimate";
import type { VisionFoodCandidate } from "@/lib/services/vision/provider";

const mocks = vi.hoisted(() => ({
  lookupByFdcId: vi.fn(),
  lookupByName: vi.fn(),
  matchByName: vi.fn(),
  findVerifiedFoodMapping: vi.fn(),
}));

vi.mock("@/lib/services/nutrition/usda-provider", () => ({
  createUsdaClient: () => ({
    lookupByFdcId: mocks.lookupByFdcId,
    lookupByName: mocks.lookupByName,
    matchByName: mocks.matchByName,
  }),
}));

vi.mock("@/lib/services/nutrition/food-vocabulary", () => ({
  findVerifiedFoodMapping: mocks.findVerifiedFoodMapping,
  // Mirror of the real normalization so the approximate fallback keeps genuine behavior.
  normalizeFoodDescription: (value: string) =>
    value.toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, " ").trim(),
}));

import { calculateNutrition } from "@/lib/services/nutrition/calculate-nutrition";

const usdaRicePer100g: NutritionEstimate = {
  calories: 130,
  proteinG: 2.7,
  carbsG: 28,
  fatG: 0.3,
  micronutrients: {},
  isApproximate: true,
  uncertaintyReason: "USDA reference values; preparation and variety may differ.",
};

function candidate(name: string, overrides: Partial<VisionFoodCandidate> = {}): VisionFoodCandidate {
  return {
    name,
    confidence: 0.9,
    boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    portionEstimate: exactPortion(200),
    hasAmbiguousAlternative: false,
    hasHiddenIngredients: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findVerifiedFoodMapping.mockResolvedValue(null);
  mocks.lookupByFdcId.mockResolvedValue(null);
  mocks.lookupByName.mockResolvedValue(null);
  mocks.matchByName.mockResolvedValue(null);
});

describe("calculateNutrition", () => {
  it("prefers a verified vocabulary mapping over name search", async () => {
    mocks.findVerifiedFoodMapping.mockResolvedValue({
      normalizedDescription: "rice",
      foodDescription: "rice",
      usdaFdcId: 169756,
      usdaDescription: "Rice, white, cooked",
      usdaDataType: "SR Legacy",
    });
    mocks.lookupByFdcId.mockResolvedValue(usdaRicePer100g);

    const result = await calculateNutrition(candidate("rice"), exactPortion(200));

    expect(mocks.lookupByFdcId).toHaveBeenCalledWith(169756);
    expect(mocks.lookupByName).not.toHaveBeenCalled();
    expect(result.calories).toBeCloseTo(260); // 130 kcal per 100g * 200g
    expect(result.uncertaintyReason).toContain("USDA");
  });

  it("retains the conservative name search when the mapped USDA record is unavailable", async () => {
    mocks.findVerifiedFoodMapping.mockResolvedValue({
      normalizedDescription: "rice",
      foodDescription: "rice",
      usdaFdcId: 169756,
      usdaDescription: "Rice, white, cooked",
      usdaDataType: "SR Legacy",
    });
    mocks.lookupByFdcId.mockResolvedValue(null);
    mocks.matchByName.mockResolvedValue({ fdcId: 169756, description: "Rice, white, cooked", estimate: usdaRicePer100g });

    const result = await calculateNutrition(candidate("rice"), exactPortion(100));

    expect(mocks.matchByName).toHaveBeenCalledWith("rice");
    expect(result.calories).toBeCloseTo(130);
  });

  it("falls back to a labeled generic estimate when USDA has no match", async () => {
    const result = await calculateNutrition(candidate("cooked white rice"), exactPortion(100));

    expect(result.calories).toBeCloseTo(130);
    expect(result.isApproximate).toBe(true);
    expect(result.uncertaintyReason).toContain("Generic");
    expect(isNutritionUnavailable(result)).toBe(false);
  });

  it("falls back to a labeled generic estimate when the USDA lookup fails outright", async () => {
    mocks.matchByName.mockRejectedValue(new Error("USDA FoodData Central returned HTTP 500"));

    const result = await calculateNutrition(candidate("cooked white rice"), exactPortion(100));

    expect(result.calories).toBeCloseTo(130);
    expect(result.uncertaintyReason).toContain("Generic");
  });

  it("returns clearly-marked unavailable nutrition for unrecognized foods", async () => {
    const result = await calculateNutrition(candidate("zz unrecognized food"), exactPortion(150));

    expect(result.calories).toBe(0);
    expect(result.isApproximate).toBe(true);
    expect(isNutritionUnavailable(result)).toBe(true);
  });

  it("scales by the midpoint of an approximate portion range and discloses it", async () => {
    mocks.matchByName.mockResolvedValue({ fdcId: 169756, description: "Rice, white, cooked", estimate: usdaRicePer100g });

    const result = await calculateNutrition(candidate("rice"), approximatePortion(100, 300));

    expect(result.calories).toBeCloseTo(260); // midpoint 200g
    expect(result.isApproximate).toBe(true);
    expect(result.uncertaintyReason).toContain("Portion size is approximate");
  });

  it("flags hidden ingredients without inventing or double-counting nutrition", async () => {
    mocks.matchByName.mockResolvedValue({ fdcId: 169756, description: "Rice, white, cooked", estimate: usdaRicePer100g });

    const result = await calculateNutrition(candidate("rice", { hasHiddenIngredients: true }), exactPortion(100));

    expect(result.calories).toBeCloseTo(130); // only the named food contributes
    expect(result.isApproximate).toBe(true);
    expect(result.uncertaintyReason).toContain("hidden or unclear");
  });

  it("preserves the source uncertainty reason alongside portion uncertainty", async () => {
    mocks.matchByName.mockResolvedValue({ fdcId: 169756, description: "Rice, white, cooked", estimate: usdaRicePer100g });

    const result = await calculateNutrition(candidate("rice"), approximatePortion(100, 300));

    expect(result.uncertaintyReason).toContain("USDA reference values");
    expect(result.uncertaintyReason).toContain("Portion size is approximate");
  });

  it("preserves the source reason when hidden ingredients are flagged", async () => {
    mocks.matchByName.mockResolvedValue({ fdcId: 169756, description: "Rice, white, cooked", estimate: usdaRicePer100g });

    const result = await calculateNutrition(candidate("rice", { hasHiddenIngredients: true }), exactPortion(100));

    expect(result.uncertaintyReason).toContain("USDA reference values");
    expect(result.uncertaintyReason).toContain("hidden or unclear");
  });

  it("uses the labeled generic steak fallback when USDA finds nothing compatible", async () => {
    // lookupByName returns null when only "Steak sauce"-style records exist (see usda-name-match tests).
    const result = await calculateNutrition(candidate("steak"), exactPortion(185));

    expect(result.calories).toBeCloseTo(388.5); // 210 kcal per 100g * 1.85
    expect(result.proteinG).toBeCloseTo(51.8); // 28g per 100g * 1.85
    expect(result.carbsG).toBe(0);
    expect(result.fatG).toBeCloseTo(18.5); // 10g per 100g * 1.85
    expect(result.isApproximate).toBe(true);
    expect(result.uncertaintyReason).toContain("Generic");
    expect(isNutritionUnavailable(result)).toBe(false);
  });
});

describe("calculateNutritionWithProvenance (USDA serving provenance)", () => {
  const aiPick = { fdcId: 555, description: "Sauce, peppercorn, restaurant", source: "ai_selected" as const };

  it("reports verified_mapping provenance when a verified mapping serves nutrition", async () => {
    mocks.findVerifiedFoodMapping.mockResolvedValue({
      normalizedDescription: "rice",
      foodDescription: "rice",
      usdaFdcId: 169756,
      usdaDescription: "Rice, white, cooked",
      usdaDataType: "SR Legacy",
    });
    mocks.lookupByFdcId.mockResolvedValue(usdaRicePer100g);

    const { estimate, usda } = await (await import("@/lib/services/nutrition/calculate-nutrition"))
      .calculateNutritionWithProvenance(candidate("rice"), exactPortion(100), aiPick);

    expect(usda).toEqual({ fdcId: 169756, description: "Rice, white, cooked", source: "verified_mapping" });
    expect(estimate.calories).toBeCloseTo(130);
    // Verified precedence: the AI pick never reaches a detail lookup.
    expect(mocks.lookupByFdcId).toHaveBeenCalledTimes(1);
    expect(mocks.lookupByFdcId).toHaveBeenCalledWith(169756);
  });

  it("applies a valid AI selection via detail lookup and reports ai_selected", async () => {
    mocks.lookupByFdcId.mockResolvedValue(usdaRicePer100g);

    const { calculateNutritionWithProvenance } = await import("@/lib/services/nutrition/calculate-nutrition");
    const { estimate, usda } = await calculateNutritionWithProvenance(candidate("rice"), exactPortion(200), aiPick);

    expect(mocks.lookupByFdcId).toHaveBeenCalledWith(555);
    expect(usda).toEqual({ fdcId: 555, description: "Sauce, peppercorn, restaurant", source: "ai_selected" });
    expect(estimate.calories).toBeCloseTo(260);
    expect(mocks.matchByName).not.toHaveBeenCalled();
  });

  it("falls through to the name search when the selected record's detail lookup fails", async () => {
    mocks.lookupByFdcId.mockResolvedValue(null);
    mocks.matchByName.mockResolvedValue({ fdcId: 169756, description: "Rice, white, cooked", estimate: usdaRicePer100g });

    const { calculateNutritionWithProvenance } = await import("@/lib/services/nutrition/calculate-nutrition");
    const { estimate, usda } = await calculateNutritionWithProvenance(candidate("rice"), exactPortion(100), aiPick);

    expect(usda).toEqual({ fdcId: 169756, description: "Rice, white, cooked", source: "name_search" });
    expect(estimate.calories).toBeCloseTo(130);
  });

  it("reports name_search provenance for the strict name match, and null for approximate tiers", async () => {
    mocks.matchByName.mockResolvedValue({ fdcId: 169756, description: "Rice, white, cooked", estimate: usdaRicePer100g });
    const { calculateNutritionWithProvenance } = await import("@/lib/services/nutrition/calculate-nutrition");

    const searched = await calculateNutritionWithProvenance(candidate("rice"), exactPortion(100));
    expect(searched.usda).toEqual({ fdcId: 169756, description: "Rice, white, cooked", source: "name_search" });

    mocks.matchByName.mockResolvedValue(null);
    const approximated = await calculateNutritionWithProvenance(candidate("steak"), exactPortion(185));
    expect(approximated.usda).toBeNull();
    expect(approximated.estimate.uncertaintyReason).toContain("Generic");

    const unavailable = await calculateNutritionWithProvenance(candidate("zz unrecognized food"), exactPortion(100));
    expect(unavailable.usda).toBeNull();
    expect(isNutritionUnavailable(unavailable.estimate)).toBe(true);
  });
});
