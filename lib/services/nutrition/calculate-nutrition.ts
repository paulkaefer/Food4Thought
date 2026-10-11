import { emptyNutritionEstimate, type NutritionEstimate } from "@/lib/models/nutrition-estimate";
import type { PortionEstimate } from "@/lib/models/portion-estimate";
import type { VisionFoodCandidate } from "@/lib/services/vision/provider";
import { createUsdaClient } from "./usda-provider";
import { findVerifiedFoodMapping } from "./food-vocabulary";
import { approximateFoodNutrition } from "./approximate-food-nutrition";
import { portionReferenceGrams } from "@/lib/services/vision/estimate-portion";

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

/** How the USDA record that served nutrition was chosen. AI-selected and user-selected
 * matches are meal-local; only human review creates shared FoodVocabulary mappings. */
export type UsdaServingSource = "verified_mapping" | "ai_selected" | "user_selected" | "name_search";

/** The USDA record that actually served nutrition, or null for approximate/unavailable tiers. */
export interface UsdaServing {
  fdcId: number;
  description: string;
  source: UsdaServingSource;
}

/** A candidate chosen outside the strict name search: by the AI selector or by the user. */
export interface PreselectedUsdaMatch {
  fdcId: number;
  description: string;
  source: "ai_selected" | "user_selected" | "name_search";
}

export interface NutritionWithProvenance {
  estimate: NutritionEstimate;
  usda: UsdaServing | null;
}

/** Scale a per-100g reference by the portion and compose the uncertainty disclosure (FR-010, FR-012). */
function finalizeNutrition(
  per100g: NutritionEstimate,
  candidate: VisionFoodCandidate,
  portion: PortionEstimate,
): NutritionEstimate {
  const grams = portionReferenceGrams(portion);
  const scaled = scalePer100g(per100g, grams);

  const isApproximate = portion.isApproximate || candidate.hasHiddenIngredients || scaled.isApproximate;
  // Compose disclosures: portion/hidden-ingredient warnings augment the source
  // reason (USDA / generic / broad category) instead of overwriting it.
  const reasons: string[] = [];
  if (scaled.uncertaintyReason) reasons.push(scaled.uncertaintyReason);
  if (candidate.hasHiddenIngredients) {
    reasons.push("Ingredients are hidden or unclear (e.g. sauces/toppings) — treat this as an estimate, mystery sauce and all.");
  } else if (portion.isApproximate) {
    reasons.push(portion.portionConfidenceWarning ?? "Portion size is approximate — no scale reference was visible.");
  }

  return { ...scaled, isApproximate, uncertaintyReason: reasons.length > 0 ? reasons.join(" ") : null };
}

/** Clearly-marked placeholder zeros: unknown data, NOT an assertion of zero calories. */
function unavailableNutrition(candidate: VisionFoodCandidate): NutritionEstimate {
  return {
    ...emptyNutritionEstimate(),
    isApproximate: true,
    uncertaintyReason: candidate.hasHiddenIngredients
      ? "Hidden or unclear ingredients; nutrition unavailable without a verified USDA match. Zero values are placeholders, not measured nutrition."
      : "Nutrition unavailable: no verified USDA match. Zero values are placeholders, not measured nutrition; meal totals may be incomplete.",
  };
}

/**
 * Combines vision output + USDA lookup into a FoodItem-ready NutritionEstimate, reporting
 * which USDA record served it. Precedence: verified FoodVocabulary mapping -> preselected
 * (AI/user) match -> conservative name search -> approximate tiers -> unavailable.
 * A preselected match applies only after a successful USDA detail lookup with usable
 * nutrition data; otherwise the standard chain continues untouched.
 */
export async function calculateNutritionWithProvenance(
  candidate: VisionFoodCandidate,
  portion: PortionEstimate,
  preselected?: PreselectedUsdaMatch,
): Promise<NutritionWithProvenance> {
  const usda = createUsdaClient();
  // A verified mapping selects an exact USDA record. If that record is unavailable,
  // retain the existing conservative name search as a fallback.
  const verified = await findVerifiedFoodMapping(candidate.name).catch(() => null);
  const verifiedEstimate = verified
    ? await usda.lookupByFdcId(verified.usdaFdcId).catch(() => null)
    : null;
  if (verified && verifiedEstimate) {
    return {
      estimate: finalizeNutrition(verifiedEstimate, candidate, portion),
      usda: { fdcId: verified.usdaFdcId, description: verified.usdaDescription, source: "verified_mapping" },
    };
  }

  if (preselected) {
    const selectedEstimate = await usda.lookupByFdcId(preselected.fdcId).catch(() => null);
    if (selectedEstimate) {
      return {
        estimate: finalizeNutrition(selectedEstimate, candidate, portion),
        usda: { fdcId: preselected.fdcId, description: preselected.description, source: preselected.source },
      };
    }
  }

  const nameMatch = await usda.matchByName(candidate.name).catch(() => null);
  if (nameMatch) {
    return {
      estimate: finalizeNutrition(nameMatch.estimate, candidate, portion),
      usda: { fdcId: nameMatch.fdcId, description: nameMatch.description, source: "name_search" },
    };
  }

  const approximate = approximateFoodNutrition(candidate.name);
  if (!approximate) return { estimate: unavailableNutrition(candidate), usda: null };
  return { estimate: finalizeNutrition(approximate, candidate, portion), usda: null };
}

/**
 * Combines vision output + USDA lookup into a FoodItem-ready NutritionEstimate, disclosing uncertainty
 * whenever the portion is approximate or ingredients are hidden (FR-010, FR-012).
 */
export async function calculateNutrition(
  candidate: VisionFoodCandidate,
  portion: PortionEstimate,
): Promise<NutritionEstimate> {
  return (await calculateNutritionWithProvenance(candidate, portion)).estimate;
}

export function zeroNutrition(): NutritionEstimate {
  return emptyNutritionEstimate();
}
