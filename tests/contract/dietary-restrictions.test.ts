import { describe, expect, it } from "vitest";
import { putDietaryRestrictionsSchema } from "@/lib/api/schemas";

describe("GET/PUT /api/v1/users/{id}/dietary-restrictions", () => {
  it("accepts a valid list of restriction types", () => {
    const parsed = putDietaryRestrictionsSchema.parse({ restrictions: ["gluten_free", "nut_allergy"] });
    expect(parsed.restrictions).toEqual(["gluten_free", "nut_allergy"]);
  });

  it("accepts an empty list (no restrictions set)", () => {
    const parsed = putDietaryRestrictionsSchema.parse({ restrictions: [] });
    expect(parsed.restrictions).toEqual([]);
  });

  it("rejects an unknown restriction type", () => {
    expect(() => putDietaryRestrictionsSchema.parse({ restrictions: ["keto"] })).toThrow();
  });
});
