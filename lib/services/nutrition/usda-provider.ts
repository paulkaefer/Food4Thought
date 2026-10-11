import type { NutritionEstimate } from "@/lib/models/nutrition-estimate";

export class UsdaProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "UsdaProviderError";
    this.cause = options?.cause;
  }
}

interface UsdaFoodDataCentralClient {
  lookupByName(name: string): Promise<NutritionEstimate | null>;
  lookupByFdcId(fdcId: number): Promise<NutritionEstimate | null>;
}

interface FoodSearchItem {
  description?: string;
  dataType?: string;
  foodNutrients?: Array<{ nutrientId?: number; nutrientNumber?: string; nutrientName?: string; unitName?: string; value?: number }>;
}

const NORMALIZE = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIASES: Record<string, string> = {
  pistachios: "Nuts, pistachio nuts",
  pistachio: "Nuts, pistachio nuts",
  beetroot: "Beets",
  beetroots: "Beets",
  "grated parmesan": "Cheese, parmesan",
  "parmesan cheese": "Cheese, parmesan",
  "grated cheddar": "Cheese, cheddar",
  "cheddar cheese": "Cheese, cheddar",
  "grated mozzarella": "Cheese, mozzarella",
  "mozzarella cheese": "Cheese, mozzarella",
};
const AMBIGUOUS = /^(cheese|grated cheese|shredded cheese)$/i;
const PREFERRED_TYPES = new Set(["Foundation", "SR Legacy", "Survey (FNDDS)"]);

/**
 * Words that signal a materially different food category when they appear only in a
 * prefix candidate's extra description text (e.g. "steak" must never match
 * "Steak sauce"). A prefix match is not accepted merely because its description
 * begins with the query.
 */
const INCOMPATIBLE_SUFFIX_WORDS = new Set([
  "sauce", "sauces", "sandwich", "soup", "dip", "dressing", "gravy", "stew",
  "casserole", "pizza", "pie", "salad", "taco", "burrito", "wrap", "sub",
  "chip", "chips", "cracker", "crackers", "cake", "cookie", "cookies", "bread",
  "roll", "bun", "juice", "drink", "beverage", "smoothie", "cocktail",
  "noodle", "noodles", "pasta", "rice",
]);

/**
 * True only when every word beyond the query prefix is a compatible qualifier
 * (cut, preparation, variety) rather than a different food category.
 */
function isCompatiblePrefixMatch(searchQuery: string, normalizedDescription: string): boolean {
  const suffix = normalizedDescription.slice(searchQuery.length).trim();
  if (!suffix) return true;
  return !suffix.split(" ").some((word) => INCOMPATIBLE_SUFFIX_WORDS.has(word));
}

function nutritionFromUsdaFood(food: FoodSearchItem): NutritionEstimate | null {
  const nutrients = food.foodNutrients ?? [];
  const get = (id: number, unit: string): number | null => {
    const nutrient = nutrients.find((n) => (n.nutrientId === id || n.nutrientNumber === String(id)) && n.unitName?.toLowerCase() === unit);
    return typeof nutrient?.value === "number" && Number.isFinite(nutrient.value) ? nutrient.value : null;
  };
  // USDA nutrient IDs: 1008 energy (kcal), 1003 protein, 1005 carbohydrate, 1004 fat.
  const calories = get(1008, "kcal") ?? get(2047, "kcal") ?? get(2048, "kcal");
  const proteinG = get(1003, "g");
  const carbsG = get(1005, "g");
  const fatG = get(1004, "g");
  if ([calories, proteinG, carbsG, fatG].some((value) => value === null)) return null;
  return {
    calories: calories!,
    proteinG: proteinG!,
    carbsG: carbsG!,
    fatG: fatG!,
    micronutrients: {},
    isApproximate: true,
    uncertaintyReason: "USDA reference values; preparation and variety may differ.",
  };
}

/** Look up reference nutrients per 100g. Null means no trustworthy match, never zero nutrition. */
export function createUsdaClient(apiKey = process.env.USDA_FDC_API_KEY): UsdaFoodDataCentralClient {
  return {
    async lookupByFdcId(fdcId: number): Promise<NutritionEstimate | null> {
      if (!apiKey || !Number.isSafeInteger(fdcId) || fdcId <= 0) return null;
      try {
        const response = await fetch(
          `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${encodeURIComponent(apiKey)}`,
          { signal: AbortSignal.timeout(7000) },
        );
        if (response.status === 404) return null;
        if (!response.ok) throw new UsdaProviderError(`USDA FoodData Central returned HTTP ${response.status}`);
        const food = (await response.json()) as FoodSearchItem;
        if (!PREFERRED_TYPES.has(food.dataType ?? "")) return null;
        // Detail responses nest nutrient metadata; flatten to the search response shape.
        // Omit avoids intersecting the two foodNutrients array shapes (TS keeps them distinct).
        const detail = food as Omit<FoodSearchItem, "foodNutrients"> & {
          foodNutrients?: Array<{ nutrient?: { id?: number; number?: string; unitName?: string }; amount?: number; nutrientId?: number; nutrientNumber?: string; unitName?: string; value?: number }>;
        };
        const normalized: FoodSearchItem = {
          ...food,
          foodNutrients: (detail.foodNutrients ?? []).map((entry) => ({
            nutrientId: entry.nutrient?.id ?? entry.nutrientId,
            nutrientNumber: entry.nutrient?.number ?? entry.nutrientNumber,
            unitName: entry.nutrient?.unitName ?? entry.unitName,
            value: entry.amount ?? entry.value,
          })),
        };
        return nutritionFromUsdaFood(normalized);
      } catch (error) {
        throw new UsdaProviderError("Failed to retrieve USDA food by FDC ID", { cause: error });
      }
    },
    async lookupByName(name: string): Promise<NutritionEstimate | null> {
      if (!apiKey) return null;
      const query = NORMALIZE(name);
      if (!query || AMBIGUOUS.test(name.trim()) || /unknown|puree|pureed|sauce|spread| or /.test(query)) return null;
      const searchName = ALIASES[query] ?? name;
      const searchQuery = NORMALIZE(searchName);
      try {
        const response = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: searchName, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"], pageSize: 15 }),
            signal: AbortSignal.timeout(7000),
          },
        );
        if (!response.ok) throw new UsdaProviderError(`USDA FoodData Central returned HTTP ${response.status}`);
        const payload = (await response.json()) as { foods?: FoodSearchItem[] };
        const foods = (payload.foods ?? []).filter((food) => food.description && PREFERRED_TYPES.has(food.dataType ?? ""));
        // Conservative matching: require the complete food name as a phrase, not just a shared word.
        // Prefix candidates are accepted only when their extra words stay food-compatible,
        // so "steak" can never resolve to "Steak sauce" or another materially different food.
        const match = foods.find((food) => NORMALIZE(food.description ?? "") === searchQuery)
          ?? foods.find((food) => {
            const description = NORMALIZE(food.description ?? "");
            return description.startsWith(searchQuery + " ") && isCompatiblePrefixMatch(searchQuery, description);
          });
        if (!match) return null;
        return nutritionFromUsdaFood(match);
      } catch (error) {
        throw new UsdaProviderError("Failed to look up nutrition data from USDA FoodData Central", { cause: error });
      }
    },
  };
}
