import type { NutritionEstimate } from "@/lib/models/nutrition-estimate";
import { lookupByBarcode } from "./open-food-facts-provider";
import { isOnline, type RestaurantNutritionProvider } from "./restaurant-provider";

export type FoodDataSource = "visual_estimate" | "packaged_label" | "restaurant_data";

export interface SourceSelectionResult {
  dataSource: FoodDataSource;
  nutrition: NutritionEstimate | null;
  disclosure: string;
}

/**
 * Precedence: packaged_label -> restaurant_data -> visual_estimate (FR-024, FR-025, FR-026).
 * Always returns a disclosed dataSource, even when falling back to a visual estimate.
 */
export async function selectNutritionSource(
  foodName: string,
  restaurantProvider: RestaurantNutritionProvider,
  barcode?: string,
): Promise<SourceSelectionResult> {
  if (barcode) {
    const label = await lookupByBarcode(barcode).catch(() => ({ found: false as const }));
    if (label.found && label.nutrition) {
      return { dataSource: "packaged_label", nutrition: label.nutrition, disclosure: "Manufacturer's published nutrition facts" };
    }
  }

  if (isOnline()) {
    const restaurant = await restaurantProvider.lookup(foodName).catch(() => ({ found: false as const }));
    if (restaurant.found && restaurant.nutrition) {
      return {
        dataSource: "restaurant_data",
        nutrition: restaurant.nutrition,
        disclosure: `Published nutrition facts from ${restaurant.restaurantName ?? "the restaurant"}`,
      };
    }
  }

  return {
    dataSource: "visual_estimate",
    nutrition: null,
    disclosure: isOnline()
      ? "Visual estimate — no packaged label or restaurant match was found"
      : "Visual estimate — restaurant lookup was unavailable offline",
  };
}
