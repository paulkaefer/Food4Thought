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

/** USDA FoodData Central client for generic-food nutrition (research.md #3), with explicit failure/timeout handling. */
export function createUsdaClient(apiKey = process.env.USDA_FDC_API_KEY): UsdaFoodDataCentralClient {
  return {
    async lookupByName(name: string): Promise<NutritionEstimate | null> {
      if (!apiKey) {
        // No API key configured (e.g. local dev/tests) — caller falls back to a rough estimate.
        return null;
      }
      try {
        const response = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(name)}&api_key=${apiKey}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!response.ok) {
          throw new UsdaProviderError(`USDA FoodData Central returned ${response.status}`);
        }
        const payload = (await response.json()) as {
          foods?: Array<{ foodNutrients?: Array<{ nutrientName: string; value: number }> }>;
        };
        const nutrients = payload.foods?.[0]?.foodNutrients ?? [];
        const find = (key: string) => nutrients.find((n) => n.nutrientName.toLowerCase().includes(key))?.value ?? 0;
        return {
          calories: find("energy"),
          proteinG: find("protein"),
          carbsG: find("carbohydrate"),
          fatG: find("total lipid"),
          micronutrients: {},
          isApproximate: false,
          uncertaintyReason: null,
        };
      } catch (error) {
        throw new UsdaProviderError("Failed to look up nutrition data from USDA FoodData Central", { cause: error });
      }
    },
  };
}
