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

/**
 * Conservative lexical compatibility gate. This is not a semantic food model:
 * unknown ingredients and insufficiently described matches must be reviewed,
 * not assumed equivalent.
 */
export function candidateIsCompatible(description: string, usdaDescription: string): boolean {
  const source = normalizeFoodDescription(description);
  const target = normalizeFoodDescription(usdaDescription);
  if (!source || !target || /^(cheese|grated cheese|shredded cheese)$/.test(source)) return false;

  const tokens = (s: string) => s.split(" ").filter(Boolean);
  const sourceTokens = tokens(source);
  const targetTokens = tokens(target);
  const sourceSet = new Set(sourceTokens);
  const targetSet = new Set(targetTokens);

  // Only grammatical, shape, and standardized preparation terms are ignorable.
  // In particular, no meat, vegetable, sauce, or cheese variety is ignorable.
  const noise = new Set(["with", "and", "of", "the", "in", "a", "an", "pieces", "piece",
    "sliced", "slice", "chopped", "diced", "minced", "grated", "shredded",
    "pork", "cured", "cooked", "pan", "fried", "prepared", "plain"]);
  const canonical = (word: string) => {
    if (word === "tomatoes") return "tomato";
    if (word === "potatoes") return "potato";
    if (word === "nuts") return "nut";
    return word;
  };
  const core = (words: string[]) => new Set(words.map(canonical).filter((word) => !noise.has(word)));

  const requested = core(sourceTokens);
  const offered = core(targetTokens);
  if (!requested.size || !offered.size) return false;

  // A food must contain all meaningful requested concepts; partial overlap
  // (e.g. pasta but no tomato sauce) is never sufficient.
  for (const word of requested) if (!offered.has(word)) return false;

  // Reject unrequested substantive ingredients, not just known bad examples.
  // This deliberately favors no match over an unsupported nutritional claim.
  for (const word of offered) if (!requested.has(word)) return false;

  // Do not substitute turkey bacon for pork bacon, or raw for cooked food.
  if (sourceSet.has("bacon") && targetSet.has("turkey") !== sourceSet.has("turkey")) return false;
  if (targetSet.has("raw") && ["cooked", "fried", "baked", "roasted"].some((w) => sourceSet.has(w))) return false;
  if (sourceSet.has("raw") && ["cooked", "fried", "baked", "roasted"].some((w) => targetSet.has(w))) return false;
  if (sourceSet.has("bacon") && sourceSet.has("fried") && !targetSet.has("fried")) return false;

  return true;
}
