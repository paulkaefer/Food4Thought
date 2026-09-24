import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";

describe("POST /api/v1/scans — clear single-food fixture", () => {
  it("identifies a single food and returns macro/micronutrient data", async () => {
    const provider = new StubFoodVisionProvider();
    const result = await provider.analyze("fixtures/single-food-apple.jpg");

    expect(result.contentClassification).toBe("food");
    expect(result.isLowQuality).toBe(false);
    expect(result.foodCandidates).toHaveLength(1);
    expect(result.foodCandidates[0].name).toBe("apple");
    expect(result.foodCandidates[0].portionEstimate.amount).not.toBeNull();
  });
});
