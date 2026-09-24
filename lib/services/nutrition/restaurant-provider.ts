import type { NutritionEstimate } from "@/lib/models/nutrition-estimate";

/** Vendor-agnostic boundary for restaurant menu nutrition data; only ever called when online (FR-025, FR-026). */
export interface RestaurantNutritionProvider {
  lookup(foodName: string): Promise<{ found: boolean; restaurantName?: string; nutrition?: NutritionEstimate }>;
}

export class RestaurantProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "RestaurantProviderError";
    this.cause = options?.cause;
  }
}

/** Stub adapter: never claims a match, so callers safely fall back to visual estimation until a real vendor is configured. */
export class StubRestaurantNutritionProvider implements RestaurantNutritionProvider {
  async lookup(): Promise<{ found: boolean }> {
    return { found: false };
  }
}

export function isOnline(): boolean {
  // In the browser this would check navigator.onLine; on the server we treat presence of
  // provider configuration as the online/offline signal for restaurant lookup (FR-026).
  return Boolean(process.env.RESTAURANT_NUTRITION_API_BASE_URL);
}
