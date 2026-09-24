import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";

describe("Scan — visually similar foods (FR-013)", () => {
  it("flags an ambiguous alternative so the item requires confirmation before it counts toward totals", async () => {
    const provider = new StubFoodVisionProvider();
    const result = await provider.analyze("fixtures/visually-similar-mash.jpg");
    const candidate = result.foodCandidates[0];

    expect(candidate.hasAmbiguousAlternative).toBe(true);
    expect(candidate.confidence).toBeLessThan(0.7);
  });
});
