import type { NutritionEstimate } from "@/lib/models/nutrition-estimate";
import { normalizeFoodDescription } from "./food-vocabulary";

// Rounded illustrative reference values per 100 grams for common foods.
// Not a USDA record or a measurement of the photographed meal.
// Tuple shape: [calories, proteinG, carbsG, fatG].
const reference: Record<string, [number, number, number, number]> = {
  // --- pasta & grains ---
  "spaghetti pasta": [158, 5.8, 30.9, 0.9],
  "spaghetti": [158, 5.8, 30.9, 0.9],
  "cooked spaghetti": [158, 5.8, 30.9, 0.9],
  "pasta": [158, 5.8, 30.9, 0.9],
  "cooked pasta": [158, 5.8, 30.9, 0.9],
  "gnocchi": [140, 3.5, 29, 0.6],
  "rice": [130, 2.7, 28, 0.3],
  "cooked rice": [130, 2.7, 28, 0.3],
  "white rice": [130, 2.7, 28, 0.3],
  "cooked white rice": [130, 2.7, 28, 0.3],
  "brown rice": [123, 2.7, 26, 1],
  "cooked brown rice": [123, 2.7, 26, 1],
  "bread": [265, 9, 49, 3.2],
  "white bread": [265, 9, 49, 3.2],
  // --- proteins ---
  "chicken breast": [165, 31, 0, 3.6],
  "grilled chicken": [165, 31, 0, 3.6],
  "grilled chicken breast": [165, 31, 0, 3.6],
  "ground beef": [250, 26, 0, 15],
  "cooked ground beef": [250, 26, 0, 15],
  "fried bacon": [540, 37, 1.5, 42],
  "fried bacon pieces": [540, 37, 1.5, 42],
  "salmon": [205, 22, 0, 12],
  "baked salmon": [205, 22, 0, 12],
  "egg": [155, 13, 1.1, 11],
  "boiled egg": [155, 13, 1.1, 11],
  "fried egg": [155, 13, 1.1, 11],
  "scrambled egg": [148, 10, 1.6, 11],
  // Generic cooked beef steak blended across cuts; deliberately not cut-specific.
  "steak": [210, 28, 0, 10],
  "beef steak": [210, 28, 0, 10],
  "cooked steak": [210, 28, 0, 10],
  "grilled steak": [210, 28, 0, 10],
  "pan seared steak": [210, 28, 0, 10],
  // --- vegetables ---
  "basil": [23, 3.2, 2.7, 0.6],
  "basil leaves": [23, 3.2, 2.7, 0.6],
  "fresh basil": [23, 3.2, 2.7, 0.6],
  "broccoli": [34, 2.8, 6.6, 0.4],
  "cooked broccoli": [35, 2.4, 7.2, 0.4],
  "lettuce": [15, 1.4, 2.9, 0.2],
  "salad greens": [17, 1.3, 3.3, 0.3],
  "mixed salad greens": [17, 1.3, 3.3, 0.3],
  "baked potato": [93, 2.5, 21, 0.1],
  "mashed potatoes": [113, 1.9, 17, 4.2],
  "french fries": [312, 3.4, 41, 15],
  // --- fruit ---
  "apple": [52, 0.3, 14, 0.2],
  "banana": [89, 1.1, 23, 0.3],
  // --- dairy ---
  "grated cheese": [390, 30, 3, 29],
  "shredded cheese": [390, 30, 3, 29],
  "cheddar cheese": [402, 25, 1.3, 33],
  "mozzarella cheese": [280, 28, 3.1, 17],
  "parmesan cheese": [431, 38, 4.1, 29],
  // --- fats, oils & condiments ---
  "olive oil": [884, 0, 0, 100],
  "vegetable oil": [884, 0, 0, 100],
  "canola oil": [884, 0, 0, 100],
  "sesame oil": [884, 0, 0, 100],
  "coconut oil": [862, 0, 0, 100],
  "butter": [717, 0.9, 0.1, 81],
  "mayonnaise": [680, 1, 0.6, 75],
  "soy sauce": [53, 8, 5, 0.6],
  "hot sauce": [11, 0.5, 2, 0.3],
  "ketchup": [112, 1.7, 26, 0.2],
  "salsa": [29, 1.5, 6, 0.2],
  "ranch dressing": [430, 1.2, 6, 44],
  // --- sauces with exact entries (see categoryRules for the wider families) ---
  "tomato sauce": [35, 1.5, 7, 0.5],
  "pasta sauce": [60, 1.5, 9, 2],
  "marinara sauce": [50, 1.8, 8, 1.5],
  "alfredo sauce": [160, 4.5, 4, 15],
  "bechamel sauce": [110, 4.5, 7.5, 7],
  "pesto": [420, 5, 6, 42],
  "vinaigrette": [240, 0.3, 7, 23],
};

/**
 * Keyword-scoped fallbacks for sauce families whose nutrition varies widely but
 * predictably by base ingredient. Fat-dominant (cream) families are checked before
 * tomato-based ones so e.g. a tomato-cream sauce does not silently report
 * tomato-sauce fat levels. Deliberately narrow: there is no generic "sauce" rule,
 * and unrecognized descriptions still return null rather than invented nutrition.
 */
const categoryRules: ReadonlyArray<{
  label: string;
  pattern: RegExp;
  values: [number, number, number, number];
}> = [
  {
    label: "cream-based sauce",
    pattern: /\bcream(?:y)?\b.*\bsauce\b|\bsauce\b.*\bcream(?:y)?\b|\balfredo\b|\bbechamel\b|\bcarbonara\b/,
    values: [140, 3, 6, 12],
  },
  {
    label: "tomato-based sauce",
    pattern: /\btomato\b.*\bsauce\b|\bmarinara\b|\bpomodoro\b|\barrabbiata\b|\bbolognese\b/,
    values: [35, 1.5, 7, 0.5],
  },
  {
    label: "oil-based sauce or dressing",
    pattern: /\bpesto\b|\bvinaigrette\b/,
    values: [300, 2, 5, 30],
  },
];

function toEstimate(values: [number, number, number, number], uncertaintyReason: string): NutritionEstimate {
  const [calories, proteinG, carbsG, fatG] = values;
  return { calories, proteinG, carbsG, fatG, micronutrients: {}, isApproximate: true, uncertaintyReason };
}

/**
 * Approximate per-100g nutrition for common foods when no verified USDA match exists.
 * Uncertainty tiers, most to least trustworthy: USDA reference values -> generic food
 * reference (exact table entry) -> broad category estimate -> null (unavailable).
 */
export function approximateFoodNutrition(name: string): NutritionEstimate | null {
  const normalized = normalizeFoodDescription(name);
  const exact = reference[normalized];
  if (exact) {
    return toEstimate(exact, "Generic food reference estimate; variety, ingredients and preparation may differ.");
  }
  const rule = categoryRules.find((candidate) => candidate.pattern.test(normalized));
  if (rule) {
    return toEstimate(rule.values, `Broad ${rule.label} estimate; actual ingredients and preparation may differ substantially.`);
  }
  return null;
}
