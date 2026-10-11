import { candidateIsCompatible, planUsdaSearches } from "./usda-match-planner";

export interface UsdaMatchCandidate {
  fdcId: number;
  description: string;
  dataType: string;
  score: number;
}

interface SearchFood {
  fdcId?: number;
  description?: string;
  dataType?: string;
}

const ALLOWED_TYPES = new Set(["Foundation", "SR Legacy", "Survey (FNDDS)"]);

function rankCandidate(input: string, candidate: SearchFood): UsdaMatchCandidate | null {
  if (!candidate.fdcId || !Number.isSafeInteger(candidate.fdcId) ||
      !candidate.description || !ALLOWED_TYPES.has(candidate.dataType ?? "") ||
      !candidateIsCompatible(input, candidate.description)) return null;

  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const a = words(input);
  const b = words(candidate.description);
  const overlap = [...a].filter((word) => b.has(word)).length;
  const score = a.size ? overlap / a.size : 0;
  return { fdcId: candidate.fdcId, description: candidate.description, dataType: candidate.dataType!, score };
}

/**
 * Search for reviewable USDA candidates; results are never automatically verified.
 * At most three requests, and no requests for inherently ambiguous descriptions.
 */
export async function findUsdaMatchCandidates(
  description: string,
  apiKey = process.env.USDA_FDC_API_KEY,
): Promise<UsdaMatchCandidate[]> {
  const queries = planUsdaSearches(description);
  if (!apiKey || !queries.length) return [];
  const matches = new Map<number, UsdaMatchCandidate>();
  for (const query of queries) {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, dataType: [...ALLOWED_TYPES], pageSize: 25 }),
        signal: AbortSignal.timeout(7000),
      },
    );
    if (!response.ok) throw new Error(`USDA search failed with HTTP ${response.status}`);
    const payload = (await response.json()) as { foods?: SearchFood[] };
    for (const food of payload.foods ?? []) {
      const candidate = rankCandidate(description, food);
      if (candidate && (!matches.has(candidate.fdcId) || matches.get(candidate.fdcId)!.score < candidate.score)) {
        matches.set(candidate.fdcId, candidate);
      }
    }
  }
  return [...matches.values()].sort((a, b) => b.score - a.score || a.fdcId - b.fdcId).slice(0, 10);
}
