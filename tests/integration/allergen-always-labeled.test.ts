import { describe, expect, it } from "vitest";
import { labelAllergens } from "@/lib/services/restrictions/allergen-labeling";

describe("Allergen labeling (SC-003)", () => {
  it("labels shellfish/peanuts/tree-nuts/pork regardless of any restriction on file", () => {
    expect(labelAllergens("shrimp scampi")).toContain("shellfish");
    expect(labelAllergens("peanut butter sandwich")).toContain("peanuts");
    expect(labelAllergens("almond croissant")).toContain("tree_nuts");
    expect(labelAllergens("bacon strips")).toContain("pork");
  });

  it("returns no labels for foods with none of the tracked allergens", () => {
    expect(labelAllergens("steamed broccoli")).toEqual([]);
  });
});
