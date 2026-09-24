import { describe, expect, it } from "vitest";
import { selectNutritionSource } from "@/lib/services/nutrition/select-source";
import { StubRestaurantNutritionProvider } from "@/lib/services/nutrition/restaurant-provider";

describe("Restaurant lookup — offline fallback (FR-026)", () => {
  it("falls back to visual_estimate and discloses that restaurant lookup was unavailable", async () => {
    delete process.env.RESTAURANT_NUTRITION_API_BASE_URL;
    const result = await selectNutritionSource("chicken sandwich", new StubRestaurantNutritionProvider());
    expect(result.dataSource).toBe("visual_estimate");
    expect(result.disclosure).toMatch(/offline/i);
  });
});
