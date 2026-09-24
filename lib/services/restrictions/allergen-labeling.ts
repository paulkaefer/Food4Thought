export type Allergen = "shellfish" | "peanuts" | "tree_nuts" | "pork";

const ALLERGEN_KEYWORDS: Record<Allergen, string[]> = {
  shellfish: ["shrimp", "crab", "lobster", "shellfish", "prawn"],
  peanuts: ["peanut"],
  tree_nuts: ["almond", "cashew", "walnut", "pecan", "hazelnut", "pistachio"],
  pork: ["pork", "bacon", "ham", "prosciutto", "sausage"],
};

/**
 * Always labels common allergens/pork on a food, "regardless of whether the user has a related
 * restriction on file" (FR-015). This is intentionally independent of any user profile.
 */
export function labelAllergens(foodName: string): Allergen[] {
  const lower = foodName.toLowerCase();
  return (Object.keys(ALLERGEN_KEYWORDS) as Allergen[]).filter((allergen) =>
    ALLERGEN_KEYWORDS[allergen].some((keyword) => lower.includes(keyword)),
  );
}
