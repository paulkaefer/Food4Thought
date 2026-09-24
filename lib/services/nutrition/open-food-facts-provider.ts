import type { NutritionEstimate } from "@/lib/models/nutrition-estimate";

export interface OpenFoodFactsMatch {
  found: boolean;
  productName?: string;
  nutrition?: NutritionEstimate;
}

export class OpenFoodFactsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "OpenFoodFactsError";
    this.cause = options?.cause;
  }
}

/** Barcode/label lookup for packaged foods (FR-024); callers fall back to visual estimation when no match is found. */
export async function lookupByBarcode(barcode: string): Promise<OpenFoodFactsMatch> {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { found: false };
    }
    const payload = (await response.json()) as {
      status?: number;
      product?: { product_name?: string; nutriments?: Record<string, number> };
    };
    if (payload.status !== 1 || !payload.product) {
      return { found: false };
    }
    const n = payload.product.nutriments ?? {};
    return {
      found: true,
      productName: payload.product.product_name,
      nutrition: {
        calories: n["energy-kcal_100g"] ?? 0,
        proteinG: n["proteins_100g"] ?? 0,
        carbsG: n["carbohydrates_100g"] ?? 0,
        fatG: n["fat_100g"] ?? 0,
        micronutrients: {},
        isApproximate: false,
        uncertaintyReason: null,
      },
    };
  } catch (error) {
    throw new OpenFoodFactsError("Open Food Facts lookup failed", { cause: error });
  }
}
