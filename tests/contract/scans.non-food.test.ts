import { describe, expect, it } from "vitest";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { classifyContent } from "@/lib/services/vision/content-classification";
import { generateFunEstimate } from "@/lib/services/vision/fun-estimate";

describe("POST /api/v1/scans — non-food fixture", () => {
  it("classifies as non_food and produces a fun estimate excluded from real totals", async () => {
    const provider = new StubFoodVisionProvider();
    const result = await provider.analyze("fixtures/non-food-shoe.jpg");

    expect(classifyContent(result)).toBe("non_food");

    const fun = generateFunEstimate("fixtures/non-food-shoe.jpg");
    expect(fun.label).toBe("just for fun");
    expect(fun.calories).toBeGreaterThan(0);
  });
});
