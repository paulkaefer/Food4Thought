export interface NutritionEstimate {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micronutrients: Record<string, number>;
  /** true when portion is approximate or ingredients are hidden */
  isApproximate: boolean;
  /** e.g. "hidden ingredients", "ambiguous portion" (FR-012) */
  uncertaintyReason: string | null;
}

export function emptyNutritionEstimate(): NutritionEstimate {
  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, micronutrients: {}, isApproximate: false, uncertaintyReason: null };
}

/** Sum a list of per-item nutrition estimates into a combined meal total (data-model.md: MealLogEntry.combinedNutritionTotals). */
export function sumNutritionEstimates(items: NutritionEstimate[]): NutritionEstimate {
  const total = items.reduce<NutritionEstimate>(
    (acc, item) => {
      const micronutrients = { ...acc.micronutrients };
      for (const [key, value] of Object.entries(item.micronutrients)) {
        micronutrients[key] = (micronutrients[key] ?? 0) + value;
      }
      return {
        calories: acc.calories + item.calories,
        proteinG: acc.proteinG + item.proteinG,
        carbsG: acc.carbsG + item.carbsG,
        fatG: acc.fatG + item.fatG,
        micronutrients,
        isApproximate: acc.isApproximate || item.isApproximate,
        uncertaintyReason: acc.uncertaintyReason ?? item.uncertaintyReason,
      };
    },
    emptyNutritionEstimate(),
  );
  return total;
}

/** Scale every nutrient field by a consumption fraction (FR-019: "MUST scale ... proportionally", not just calories). */
export function scaleNutritionEstimate(estimate: NutritionEstimate, fraction: number): NutritionEstimate {
  const clamped = Math.max(0, Math.min(1, fraction));
  const micronutrients: Record<string, number> = {};
  for (const [key, value] of Object.entries(estimate.micronutrients)) {
    micronutrients[key] = value * clamped;
  }
  return {
    calories: estimate.calories * clamped,
    proteinG: estimate.proteinG * clamped,
    carbsG: estimate.carbsG * clamped,
    fatG: estimate.fatG * clamped,
    micronutrients,
    isApproximate: estimate.isApproximate,
    uncertaintyReason: estimate.uncertaintyReason,
  };
}

/** Marker phrase (case-insensitive) identifying placeholder-zero results where no trustworthy nutrition source exists. */
export const NUTRITION_UNAVAILABLE_MARKER = "nutrition unavailable";

/**
 * True when an estimate represents unavailable data (placeholder zeros), never measured
 * nutrition. Keyed on the uncertainty reason — deliberately not on zero values — so
 * genuinely zero-calorie reference foods (e.g. water) are not mislabeled.
 * Accepts any view-model carrying an uncertaintyReason, not just full NutritionEstimates.
 */
export function isNutritionUnavailable(estimate: Pick<NutritionEstimate, "uncertaintyReason">): boolean {
  return estimate.uncertaintyReason?.toLowerCase().includes(NUTRITION_UNAVAILABLE_MARKER) ?? false;
}

/** True when any item lacks nutrition data, meaning summed meal totals are partial/incomplete. */
export function hasIncompleteTotals(items: NutritionEstimate[]): boolean {
  return items.some(isNutritionUnavailable);
}
