import { describe, expect, it } from "vitest";
import { diffBeforeAfterPhotos } from "@/lib/services/consumption/photo-diff";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";

describe("Before/after photo diff (FR-021)", () => {
  it("never assumes 100% consumption unless the after-photo is an empty plate", async () => {
    const provider = new StubFoodVisionProvider();
    const diff = await diffBeforeAfterPhotos(provider, [{ name: "apple", portionGrams: 182 }], "fixtures/single-food-apple.jpg");
    expect(diff.consumedFractionByItem.apple).toBeLessThan(1);
  });

  it("reports full consumption when the after-photo shows an empty plate", async () => {
    const provider = new StubFoodVisionProvider();
    const diff = await diffBeforeAfterPhotos(provider, [{ name: "apple", portionGrams: 182 }], "fixtures/empty-plate.jpg");
    expect(diff.consumedFractionByItem.apple).toBe(1);
    expect(diff.removalSuspected).toBe(false);
  });
});
