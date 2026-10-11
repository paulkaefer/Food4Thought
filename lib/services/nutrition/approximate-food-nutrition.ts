import type { NutritionEstimate } from "@/lib/models/nutrition-estimate";
import { normalizeFoodDescription } from "./food-vocabulary";

// Rounded illustrative reference values per 100 grams for common foods.
// Not a USDA record or a measurement of the photographed meal.
const reference: Record<string, [number, number, number, number]> = {
  "spaghetti pasta": [158, 5.8, 30.9, 0.9],
  "spaghetti": [158, 5.8, 30.9, 0.9],
  "cooked spaghetti": [158, 5.8, 30.9, 0.9],
  "pasta": [158, 5.8, 30.9, 0.9],
  "cooked pasta": [158, 5.8, 30.9, 0.9],
  "gnocchi": [140, 3.5, 29, 0.6],
  "tomato sauce": [35, 1.5, 7, 0.5],
  "pasta sauce": [60, 1.5, 9, 2],
  "basil": [23, 3.2, 2.7, 0.6],
  "basil leaves": [23, 3.2, 2.7, 0.6],
  "fresh basil": [23, 3.2, 2.7, 0.6],
  "fried bacon": [540, 37, 1.5, 42],
  "fried bacon pieces": [540, 37, 1.5, 42],
  "grated cheese": [390, 30, 3, 29],
  "shredded cheese": [390, 30, 3, 29],
};

export function approximateFoodNutrition(name: string): NutritionEstimate | null {
  const values = reference[normalizeFoodDescription(name)];
  if (!values) return null;
  const [calories, proteinG, carbsG, fatG] = values;
  return {
    calories, proteinG, carbsG, fatG, micronutrients: {},
    isApproximate: true,
    uncertaintyReason: "Generic food reference estimate; variety, ingredients and preparation may differ.",
  };
}
