import { describe, expect, it } from "vitest";
import { diffBeforeAfterPhotos } from "@/lib/services/consumption/photo-diff";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";

describe("Removed-vs-added food (FR-022, FR-023)", () => {
  it("requires user confirmation when an item disappears entirely (possibly removed, not eaten)", async () => {
    const provider = new StubFoodVisionProvider();
    // "apple" isn't present in the multi-item fixture's after-photo, so it looks fully gone.
    const diff = await diffBeforeAfterPhotos(provider, [{ name: "apple", portionGrams: 182 }], "fixtures/multi-item-plate.jpg");
    expect(diff.removalSuspected).toBe(true);
    expect(diff.requiresUserConfirmation).toBe(true);
  });

  it("treats a newly-appearing item as added food, not a consumption change", async () => {
    const provider = new StubFoodVisionProvider();
    const diff = await diffBeforeAfterPhotos(provider, [{ name: "rice", portionGrams: 120 }], "fixtures/multi-item-plate.jpg");
    expect(diff.addedFoodDetected).toBe(true);
  });
});
