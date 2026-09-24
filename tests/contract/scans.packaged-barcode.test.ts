import { describe, expect, it } from "vitest";
import { selectNutritionSource } from "@/lib/services/nutrition/select-source";
import { StubRestaurantNutritionProvider } from "@/lib/services/nutrition/restaurant-provider";

describe("Scan — packaged-barcode fixture", () => {
  it("falls back to visual_estimate when no barcode match is found (no network in test env)", async () => {
    const result = await selectNutritionSource("granola bar", new StubRestaurantNutritionProvider(), "000000000000");
    expect(result.dataSource).toBe("visual_estimate");
  });
});
