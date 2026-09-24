import { describe, expect, it } from "vitest";
import { exactPortion } from "@/lib/models/portion-estimate";
import { portionReferenceGrams } from "@/lib/services/vision/estimate-portion";

describe("Scan — very large portion (FR-005)", () => {
  it("uses the actual visible size rather than defaulting to a standard serving", () => {
    const largePortion = exactPortion(750); // e.g. a very large plate of pasta
    expect(portionReferenceGrams(largePortion)).toBe(750);
    expect(portionReferenceGrams(largePortion)).not.toBe(100); // not defaulted to a "standard serving"
  });
});
