import { z } from "zod";
import { candidateEquivalenceKey } from "./candidate-dedup";
import {
  findVerifiedFoodMapping,
  MAX_FOOD_MAPPING_CANDIDATES,
  normalizeFoodDescription,
} from "./food-vocabulary";
import { searchUsdaMatchCandidates, type UsdaMatchCandidate } from "./usda-match-candidates";

const storedCandidateSchema = z.array(
  z.object({
    fdcId: z.number().int().positive(),
    description: z.string(),
    dataType: z.string(),
    score: z.number(),
  }),
);

/**
 * Parse a FoodItem's usdaCandidates JSON column into typed candidates.
 * Anything unexpected (null, legacy shape, corruption) yields an empty list.
 */
export function storedUsdaCandidates(json: unknown): UsdaMatchCandidate[] {
  const parsed = storedCandidateSchema.safeParse(json ?? []);
  return parsed.success ? parsed.data : [];
}

/** Candidate set assembled for one ingredient at scan time. */
export interface IngredientUsdaCandidateSet {
  ingredientName: string;
  /** A verified mapping short-circuits assembly: no USDA search is made for this ingredient. */
  verified: { fdcId: number; description: string } | null;
  /**
   * Meaningfully distinct candidates (at most MAX_FOOD_MAPPING_CANDIDATES), deduplicated by
   * equivalence key. Contains only FDC IDs actually returned by USDA search — nothing is
   * inferred or fabricated here.
   */
  candidates: UsdaMatchCandidate[];
}

/** Meal-level bounds shared across ALL ingredients, on top of each search's own per-call caps. */
export const MEAL_USDA_CANDIDATE_TIME_BUDGET_MS = 12000;
export const MEAL_USDA_CANDIDATE_MAX_REQUESTS = 8;

export interface MealCandidateAssemblyOptions {
  timeBudgetMs?: number;
  maxRequests?: number;
  apiKey?: string;
  /** Injectable clock for deterministic budget tests. */
  now?: () => number;
}

/** Best-scored record per equivalence key, capped at MAX_FOOD_MAPPING_CANDIDATES. */
function distinctCandidates(candidates: UsdaMatchCandidate[]): UsdaMatchCandidate[] {
  const seen = new Set<string>();
  const distinct: UsdaMatchCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidateEquivalenceKey(candidate.description);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(candidate);
    if (distinct.length >= MAX_FOOD_MAPPING_CANDIDATES) break;
  }
  return distinct;
}

/**
 * Assemble bounded, deduplicated USDA candidate sets for every ingredient in a meal.
 * Advisory only: this never changes nutrition, never verifies anything, and never writes
 * to the review queue. Ingredients with a verified mapping consume none of the shared
 * meal-level request/time budget, so unmapped ingredients are prioritized. Per-ingredient
 * search failures degrade to an empty candidate set rather than failing the meal.
 */
export async function assembleMealUsdaCandidates(
  ingredientNames: string[],
  options: MealCandidateAssemblyOptions = {},
): Promise<IngredientUsdaCandidateSet[]> {
  const {
    timeBudgetMs = MEAL_USDA_CANDIDATE_TIME_BUDGET_MS,
    maxRequests = MEAL_USDA_CANDIDATE_MAX_REQUESTS,
    apiKey = process.env.USDA_FDC_API_KEY,
    now = Date.now,
  } = options;

  // One assembly per distinct food name; duplicate ingredients share the result.
  // The map key is the normalized name; the FIRST-seen original name is kept for the USDA query.
  const firstNameByNormalized = new Map<string, string>();
  for (const name of ingredientNames) {
    const normalized = normalizeFoodDescription(name);
    if (normalized && !firstNameByNormalized.has(normalized)) {
      firstNameByNormalized.set(normalized, name);
    }
  }
  const uniqueNames = [...firstNameByNormalized.entries()].map(([normalized, original]) => ({ normalized, original }));

  const startedAt = now();
  let requestsRemaining = maxRequests;
  const setsByName = new Map<string, IngredientUsdaCandidateSet>();

  for (const { normalized, original } of uniqueNames) {
    const verified = await findVerifiedFoodMapping(original).catch(() => null);
    if (verified) {
      setsByName.set(normalized, {
        ingredientName: original,
        verified: { fdcId: verified.usdaFdcId, description: verified.usdaDescription },
        candidates: [],
      });
      continue;
    }

    let candidates: UsdaMatchCandidate[] = [];
    const remainingMs = timeBudgetMs - (now() - startedAt);
    if (requestsRemaining > 0 && remainingMs > 0) {
      try {
        const result = await searchUsdaMatchCandidates(original, apiKey, {
          timeBudgetMs: remainingMs,
          maxRequests: requestsRemaining,
        });
        candidates = result.candidates;
        requestsRemaining -= result.requestsMade;
      } catch {
        // A search failure aborts that search's first failed request; keep the meal budget bounded.
        requestsRemaining -= 1;
      }
    }
    setsByName.set(normalized, { ingredientName: original, verified: null, candidates: distinctCandidates(candidates) });
  }

  const empty = (ingredientName: string): IngredientUsdaCandidateSet => ({
    ingredientName,
    verified: null,
    candidates: [],
  });
  return ingredientNames.map(
    (name) => setsByName.get(normalizeFoodDescription(name)) ?? empty(name),
  );
}
