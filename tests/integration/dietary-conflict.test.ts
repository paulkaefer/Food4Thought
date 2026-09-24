import { describe, expect, it } from "vitest";
import { detectConflicts } from "@/lib/services/restrictions/conflict-detection";
import { labelAllergens } from "@/lib/services/restrictions/allergen-labeling";

describe("Dietary conflict detection (FR-017, FR-018)", () => {
  it("flags an unverifiable restriction rather than assuming compliance (muffin, gluten-free)", () => {
    const conflicts = detectConflicts("blueberry muffin", labelAllergens("blueberry muffin"), ["gluten_free"]);
    expect(conflicts).toEqual([{ restrictionType: "gluten_free", reason: "cannot_verify" }]);
  });

  it("flags a detected conflict when an allergen matches a restriction", () => {
    const conflicts = detectConflicts("bacon strips", labelAllergens("bacon strips"), ["avoid_pork"]);
    expect(conflicts).toEqual([{ restrictionType: "avoid_pork", reason: "conflict_detected" }]);
  });

  it("produces no conflicts when the user has no restrictions on file", () => {
    expect(detectConflicts("bacon strips", labelAllergens("bacon strips"), [])).toEqual([]);
  });
});
