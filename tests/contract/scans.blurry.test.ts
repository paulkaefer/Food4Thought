import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { checkImageQuality } from "@/lib/services/ingestion/quality-check";

describe("POST /api/v1/scans — blurry fixture", () => {
  it("fails the quality check and surfaces no nutrition data", async () => {
    const provider = new StubFoodVisionProvider();
    const result = await provider.analyze("fixtures/blurry-photo.jpg");

    expect(checkImageQuality(result).passesQuality).toBe(false);
    expect(result.foodCandidates).toHaveLength(0);
  });
});
