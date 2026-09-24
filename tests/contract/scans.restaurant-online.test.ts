import { describe, expect, it } from "vitest";
import { selectNutritionSource } from "@/lib/services/nutrition/select-source";
import type { RestaurantNutritionProvider } from "@/lib/services/nutrition/restaurant-provider";

const onlineProvider: RestaurantNutritionProvider = {
  async lookup(foodName: string) {
    return {
      found: true,
      restaurantName: "Test Bistro",
      nutrition: { calories: 500, proteinG: 20, carbsG: 40, fatG: 25, micronutrients: {}, isApproximate: false, uncertaintyReason: null },
    };
  },
};

describe("Scan — restaurant-item fixture (online)", () => {
  it("uses restaurant_data and discloses the source when a match is found", async () => {
    process.env.RESTAURANT_NUTRITION_API_BASE_URL = "https://example.test";
    const result = await selectNutritionSource("chicken sandwich", onlineProvider);
    expect(result.dataSource).toBe("restaurant_data");
    expect(result.disclosure).toContain("Test Bistro");
  });
});
