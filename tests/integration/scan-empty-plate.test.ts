import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { classifyContent } from "@/lib/services/vision/content-classification";

describe("Scan — empty plate (FR-009)", () => {
  it("assigns 0 calories and classifies as empty_plate", async () => {
    const provider = new StubFoodVisionProvider();
    const result = await provider.analyze("fixtures/empty-plate.jpg");

    expect(classifyContent(result)).toBe("empty_plate");
    expect(result.foodCandidates).toHaveLength(0);
  });
});
