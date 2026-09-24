import { describe, expect, it } from "vitest";
import { diffBeforeAfterPhotos } from "@/lib/services/consumption/photo-diff";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";

describe("POST /api/v1/meal-log-entries/{id}/consumption/photo-diff", () => {
  it("reports a consumed fraction for a partially-eaten single-food photo", async () => {
    const provider = new StubFoodVisionProvider();
    const diff = await diffBeforeAfterPhotos(provider, [{ name: "apple", portionGrams: 182 }], "fixtures/single-food-apple.jpg");

    expect(diff.consumedFractionByItem.apple).toBeGreaterThanOrEqual(0);
    expect(diff.requiresUserConfirmation).toBe(false);
  });
});
