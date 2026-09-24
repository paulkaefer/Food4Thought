import { emptyNutritionEstimate, type NutritionEstimate } from "@/lib/models/nutrition-estimate";
import type { PortionEstimate } from "@/lib/models/portion-estimate";
import type { VisionFoodCandidate } from "@/lib/services/vision/provider";
import { createUsdaClient } from "./usda-provider";
import { portionReferenceGrams } from "@/lib/services/vision/estimate-portion";

const PER_100G_FALLBACK: NutritionEstimate = {
  calories: 100,
  proteinG: 3,
  carbsG: 15,
  fatG: 3,
  micronutrients: {},
  isApproximate: true,
  uncertaintyReason: "No nutrition-database match; using a rough generic estimate",
};

function scalePer100g(per100g: NutritionEstimate, grams: number): NutritionEstimate {
  const factor = grams / 100;
  const micronutrients: Record<string, number> = {};
  for (const [key, value] of Object.entries(per100g.micronutrients)) micronutrients[key] = value * factor;
  return {
    calories: per100g.calories * factor,
    proteinG: per100g.proteinG * factor,
    carbsG: per100g.carbsG * factor,
    fatG: per100g.fatG * factor,
    micronutrients,
    isApproximate: per100g.isApproximate,
    uncertaintyReason: per100g.uncertaintyReason,
  };
}

/**
 * Combines vision output + USDA lookup into a FoodItem-ready NutritionEstimate, disclosing uncertainty
 * whenever the portion is approximate or ingredients are hidden (FR-010, FR-012).
 */
export async function calculateNutrition(
  candidate: VisionFoodCandidate,
  portion: PortionEstimate,
): Promise<NutritionEstimate> {
  const usda = createUsdaClient();
  const per100g = (await usda.lookupByName(candidate.name).catch(() => null)) ?? PER_100G_FALLBACK;
  const grams = portionReferenceGrams(portion);
  const scaled = scalePer100g(per100g, grams);

  const isApproximate = portion.isApproximate || candidate.hasHiddenIngredients || scaled.isApproximate;
  let uncertaintyReason = scaled.uncertaintyReason;
  if (candidate.hasHiddenIngredients) {
    uncertaintyReason = "Ingredients are hidden or unclear (e.g. sauces/toppings) — treat this as an estimate, mystery sauce and all.";
  } else if (portion.isApproximate) {
    uncertaintyReason = portion.portionConfidenceWarning ?? "Portion size is approximate — no scale reference was visible.";
  }

  return { ...scaled, isApproximate, uncertaintyReason };
}

export function zeroNutrition(): NutritionEstimate {
  return emptyNutritionEstimate();
}
