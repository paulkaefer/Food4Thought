import { describe, expect, it } from "vitest";
import { consumptionRequestSchema } from "@/lib/api/schemas";

describe("POST /api/v1/meal-log-entries/{id}/consumption", () => {
  it("accepts a manual_fraction request", () => {
    const parsed = consumptionRequestSchema.parse({ method: "manual_fraction", consumedFraction: 0.5 });
    expect(parsed).toEqual({ method: "manual_fraction", consumedFraction: 0.5 });
  });

  it("accepts a per_item request", () => {
    const parsed = consumptionRequestSchema.parse({
      method: "per_item",
      items: [{ foodItemId: "11111111-1111-1111-1111-111111111111", consumedFraction: 1 }],
    });
    expect(parsed.method).toBe("per_item");
  });

  it("rejects an out-of-range fraction", () => {
    expect(() => consumptionRequestSchema.parse({ method: "manual_fraction", consumedFraction: 1.5 })).toThrow();
  });
});
