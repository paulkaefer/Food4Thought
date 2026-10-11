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

/** Look up reference nutrients per 100g. Null means no trustworthy match, never zero nutrition. */
export function createUsdaClient(apiKey = process.env.USDA_FDC_API_KEY): UsdaFoodDataCentralClient {
  return {
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
        const match = foods.find((food) => NORMALIZE(food.description ?? "") === searchQuery)
          ?? foods.find((food) => NORMALIZE(food.description ?? "").startsWith(searchQuery + " "));
        if (!match) return null;
        const nutrients = match.foodNutrients ?? [];
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
      } catch (error) {
        throw new UsdaProviderError("Failed to look up nutrition data from USDA FoodData Central", { cause: error });
      }
    },
  };
}
