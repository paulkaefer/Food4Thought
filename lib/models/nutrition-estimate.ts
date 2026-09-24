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
