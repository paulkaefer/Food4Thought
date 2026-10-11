import { normalizeFoodDescription } from "./food-vocabulary";

/**
 * Deterministic search planning: bounded requests and no guessed ingredients.
 * A search hit is only a candidate, never a verified nutrition mapping.
 */
export function planUsdaSearches(description: string): string[] {
  const name = normalizeFoodDescription(description);
  if (!name || /\b(unknown|unidentified)\b/.test(name) || /\bor\b/.test(name)) return [];
  if (/^(cheese|grated cheese|shredded cheese)$/.test(name)) return [];

  const queries = [description.trim()];
  const add = (query: string) => {
    if (query && !queries.some((existing) => normalizeFoodDescription(existing) === normalizeFoodDescription(query))) {
      queries.push(query);
    }
  };

  // Reordering and removing shape words is safe; changing the animal,
  // variety, or preparation is not.
  if (/\bbacon\b/.test(name) && /\b(fried|pan fried)\b/.test(name)) {
    add("bacon cooked pan fried");
    add("pork bacon cooked pan fried");
  } else if (/\bbacon\b/.test(name) && /\bcooked\b/.test(name)) {
    add("bacon cooked");
  }

  if (/\btomato sauce\b/.test(name)) add("tomato sauce");
  if (/\bgnocchi\b/.test(name)) add("gnocchi");
  return queries.slice(0, 3);
}

/** Conservative guardrails before any candidate can be considered for review. */
export function candidateIsCompatible(description: string, usdaDescription: string): boolean {
  const source = normalizeFoodDescription(description);
  const target = normalizeFoodDescription(usdaDescription);
  if (!source || !target || /^(cheese|grated cheese|shredded cheese)$/.test(source)) return false;
  if (/\bturkey\b/.test(source) !== /\bturkey\b/.test(target) && /\bbacon\b/.test(source)) return false;
  if (/\bbacon\b/.test(source) && !/\bbacon\b/.test(target)) return false;
  if (/\bgnocchi\b/.test(source) && !/\bgnocchi\b/.test(target)) return false;
  if (/\btomato sauce\b/.test(source) && !(/\btomato\b/.test(target) && /\bsauce\b/.test(target))) return false;
  if (/\b(fried|pan fried)\b/.test(source) && /\bbacon\b/.test(source) && !/\b(fried|pan fried)\b/.test(target)) return false;
  if (/\braw\b/.test(target) && /\b(cooked|fried|baked|roasted)\b/.test(source)) return false;
  return true;
}
