import type { Allergen } from "./allergen-labeling";

export type DietaryRestrictionType =
  | "gluten_free"
  | "vegetarian"
  | "vegan"
  | "nut_allergy"
  | "shellfish_allergy"
  | "avoid_pork";

export type ConflictReason = "conflict_detected" | "cannot_verify";

export interface DietaryConflict {
  restrictionType: DietaryRestrictionType;
  reason: ConflictReason;
}

// Foods that are unambiguously safe for a restriction based on name alone; anything not covered
// falls through to "cannot_verify" rather than being assumed compliant (FR-017).
const OBVIOUS_MEAT_KEYWORDS = ["chicken", "beef", "pork", "bacon", "fish", "shrimp", "salmon"];

const RESTRICTION_ALLERGEN_MAP: Partial<Record<DietaryRestrictionType, Allergen>> = {
  nut_allergy: "tree_nuts",
  shellfish_allergy: "shellfish",
  avoid_pork: "pork",
};

/**
 * Flags a food as a potential conflict when it conflicts with, or cannot be verified against, a
 * saved restriction. A photo alone is never treated as proof of compliance (FR-017, FR-018).
 */
export function detectConflicts(
  foodName: string,
  allergens: Allergen[],
  restrictions: DietaryRestrictionType[],
): DietaryConflict[] {
  const lower = foodName.toLowerCase();
  const conflicts: DietaryConflict[] = [];

  for (const restriction of restrictions) {
    const relatedAllergen = RESTRICTION_ALLERGEN_MAP[restriction];
    if (relatedAllergen && allergens.includes(relatedAllergen)) {
      conflicts.push({ restrictionType: restriction, reason: "conflict_detected" });
      continue;
    }

    if (restriction === "vegetarian" || restriction === "vegan") {
      if (OBVIOUS_MEAT_KEYWORDS.some((k) => lower.includes(k))) {
        conflicts.push({ restrictionType: restriction, reason: "conflict_detected" });
      } else {
        // A photo is not proof a dish contains no hidden animal products (e.g. broth, gelatin, dairy in vegan case).
        conflicts.push({ restrictionType: restriction, reason: "cannot_verify" });
      }
      continue;
    }

    if (restriction === "gluten_free") {
      // Gluten can't be confirmed visually (e.g. a muffin) — never assume compliance (FR-017).
      conflicts.push({ restrictionType: restriction, reason: "cannot_verify" });
    }
  }

  return conflicts;
}
