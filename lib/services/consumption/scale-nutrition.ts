import { scaleNutritionEstimate, sumNutritionEstimates, type NutritionEstimate } from "@/lib/models/nutrition-estimate";

export interface FoodItemConsumption {
  foodItemId: string;
  nutrition: NutritionEstimate;
  consumedFraction: number;
}

/** Applies consumedFraction to every nutrient field, never just calories (FR-019), and recalculates meal totals from per-item amounts (FR-020). */
export function scaleMealConsumption(items: FoodItemConsumption[]): NutritionEstimate {
  const scaled = items.map((item) => scaleNutritionEstimate(item.nutrition, item.consumedFraction));
  return sumNutritionEstimates(scaled);
}

/** Whole-meal manual fraction: scale every item's nutrition by the same fraction (FR-019). */
export function scaleWholeMeal(items: NutritionEstimate[], consumedFraction: number): NutritionEstimate {
  return scaleMealConsumption(items.map((nutrition) => ({ foodItemId: "", nutrition, consumedFraction })));
}
