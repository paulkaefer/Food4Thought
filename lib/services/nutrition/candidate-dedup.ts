import { normalizeFoodDescription } from "./food-vocabulary";
import { canonicalFoodWord } from "./usda-match-planner";

/**
 * USDA quality grades ("prime", "choice", "select", "standard") describe marbling of the
 * same cut, not a different food. Records differing only by grade are one logical review
 * choice, so every grade word collapses to a single slot in the equivalence key.
 */
const USDA_GRADE_WORDS = new Set(["prime", "choice", "select", "standard"]);
const GRADE_SLOT = "choice";

/**
 * Bag-of-words equivalence key for a USDA description. Case, whitespace, punctuation,
 * common plurals, USDA grade words, and word order are normalized away; every remaining
 * token must match exactly. Nutrition-relevant distinctions live in those tokens — cut
 * (sirloin vs shoulder), preparation (raw vs cooked, grilled vs roasted), fat retention
 * ("lean only" vs "lean and fat"), trim level, and extra ingredients (sauce vs meat) —
 * so records that differ materially always get different keys and are never collapsed.
 */
export function candidateEquivalenceKey(usdaDescription: string): string {
  return normalizeFoodDescription(usdaDescription)
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const canonicalWord = canonicalFoodWord(word);
      return USDA_GRADE_WORDS.has(canonicalWord) ? GRADE_SLOT : canonicalWord;
    })
    .sort()
    .join(" ");
}

/**
 * Group candidates by equivalence key, preserving first-appearance order of each group.
 * Purely organizational: no record is modified or discarded.
 */
export function groupEquivalentCandidates<T extends { usdaDescription: string }>(candidates: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) {
    const key = candidateEquivalenceKey(candidate.usdaDescription);
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }
  return [...groups.values()];
}

export interface ReviewableCandidate {
  usdaFdcId: number;
  usdaDescription: string;
  score: number;
  status: string;
}

/** One displayable choice: the representative record plus every record collapsed under it. */
export interface LogicalCandidateChoice<T extends ReviewableCandidate> {
  representative: T;
  members: T[];
}

const statusRank = (status: string): number =>
  status === "verified" ? 0 : status === "proposed" ? 1 : 2;

/**
 * Collapse equivalent records into logical choices for the review board. The
 * representative prefers the verified record (the live mapping must stay visible),
 * then actionable proposed rows, then rejected history; ties break on score, then on
 * the lowest FDC ID for determinism. Group order follows first appearance in the input.
 */
export function collapseToLogicalChoices<T extends ReviewableCandidate>(candidates: T[]): LogicalCandidateChoice<T>[] {
  return groupEquivalentCandidates(candidates).map((members) => {
    const sorted = [...members].sort(
      (a, b) => statusRank(a.status) - statusRank(b.status) || b.score - a.score || a.usdaFdcId - b.usdaFdcId,
    );
    return { representative: sorted[0], members: sorted };
  });
}
