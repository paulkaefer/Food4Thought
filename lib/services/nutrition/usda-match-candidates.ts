import { candidateIsReviewable, planUsdaSearches } from "./usda-match-planner";

// A type alias (not interface) so candidate arrays carry an implicit index signature
// and can be persisted into Prisma Json columns without casts.
export type UsdaMatchCandidate = {
  fdcId: number;
  description: string;
  dataType: string;
  score: number;
};

interface SearchFood {
  fdcId?: number;
  description?: string;
  dataType?: string;
}

const ALLOWED_TYPES = new Set(["Foundation", "SR Legacy", "Survey (FNDDS)"]);

function rankCandidate(input: string, candidate: SearchFood): UsdaMatchCandidate | null {
  // Review-queue recall gate: extra USDA-side ingredients are allowed here (a human
  // reviews candidates); the strict gate remains the rule for live nutrition paths.
  if (!candidate.fdcId || !Number.isSafeInteger(candidate.fdcId) ||
      !candidate.description || !ALLOWED_TYPES.has(candidate.dataType ?? "") ||
      !candidateIsReviewable(input, candidate.description)) return null;

  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const a = words(input);
  const b = words(candidate.description);
  const overlap = [...a].filter((word) => b.has(word)).length;
  const precision = a.size ? overlap / a.size : 0;
  const coverage = b.size ? overlap / b.size : 0;
  // F1-style score: fuller two-way coverage ranks above partial lexical overlap.
  const score = precision * coverage;
  return { fdcId: candidate.fdcId, description: candidate.description, dataType: candidate.dataType!, score };
}

export interface UsdaCandidateSearchLimits {
  /** Best-effort time budget for this call; a request in flight may exceed it. */
  timeBudgetMs?: number;
  /** Maximum USDA search requests this call may make (default: all planned queries). */
  maxRequests?: number;
}

export interface UsdaCandidateSearchResult {
  candidates: UsdaMatchCandidate[];
  /** Requests actually sent, so callers with a shared cross-ingredient budget can account for them. */
  requestsMade: number;
}

/**
 * Search for reviewable USDA candidates under explicit request/time limits; results are
 * never automatically verified. At most three planned queries, further capped by maxRequests.
 */
export async function searchUsdaMatchCandidates(
  description: string,
  apiKey = process.env.USDA_FDC_API_KEY,
  limits: UsdaCandidateSearchLimits = {},
): Promise<UsdaCandidateSearchResult> {
  const { timeBudgetMs = 8000, maxRequests = Number.POSITIVE_INFINITY } = limits;
  const queries = planUsdaSearches(description);
  if (!apiKey || !queries.length || maxRequests <= 0) return { candidates: [], requestsMade: 0 };
  const startedAt = Date.now();
  const matches = new Map<number, UsdaMatchCandidate>();
  let requestsMade = 0;
  for (const query of queries) {
    if (requestsMade >= maxRequests) break;
    // Best-effort budget: never start another request once the discovery budget is spent.
    const remainingMs = timeBudgetMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, dataType: [...ALLOWED_TYPES], pageSize: 25 }),
        signal: AbortSignal.timeout(Math.min(7000, remainingMs)),
      },
    );
    requestsMade++;
    if (!response.ok) throw new Error(`USDA search failed with HTTP ${response.status}`);
    const payload = (await response.json()) as { foods?: SearchFood[] };
    for (const food of payload.foods ?? []) {
      const candidate = rankCandidate(description, food);
      if (candidate && (!matches.has(candidate.fdcId) || matches.get(candidate.fdcId)!.score < candidate.score)) {
        matches.set(candidate.fdcId, candidate);
      }
    }
  }
  return {
    candidates: [...matches.values()].sort((a, b) => b.score - a.score || a.fdcId - b.fdcId).slice(0, 10),
    requestsMade,
  };
}

/**
 * Search for reviewable USDA candidates; results are never automatically verified.
 * At most three requests, and no requests for inherently ambiguous descriptions.
 */
export async function findUsdaMatchCandidates(
  description: string,
  apiKey = process.env.USDA_FDC_API_KEY,
  timeBudgetMs = 8000,
): Promise<UsdaMatchCandidate[]> {
  const { candidates } = await searchUsdaMatchCandidates(description, apiKey, { timeBudgetMs });
  return candidates;
}
