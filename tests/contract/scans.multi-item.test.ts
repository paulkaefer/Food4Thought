import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";

describe("POST /api/v1/scans — multi-item plate fixture", () => {
  it("identifies each item separately", async () => {
    const provider = new StubFoodVisionProvider();
    const result = await provider.analyze("fixtures/multi-item-plate.jpg");

    expect(result.foodCandidates.map((c) => c.name)).toEqual(["grilled chicken", "rice", "broccoli"]);
    for (const candidate of result.foodCandidates) {
      expect(candidate.portionEstimate.amount).not.toBeNull();
    }
  });
});
