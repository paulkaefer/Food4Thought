import { findUsdaMatchCandidates } from "./usda-match-candidates";
import {
  countProposedCandidates,
  findVerifiedFoodMapping,
  latestCandidateCreatedAt,
  MAX_FOOD_MAPPING_CANDIDATES,
  normalizeFoodDescription,
  proposeFoodMappingCandidates,
} from "./food-vocabulary";

export type VocabularyDiscoveryResult =
  | { status: "already_verified"; fdcId: number }
  | { status: "candidates_pending"; pending: number }
  | { status: "skipped_cooldown"; pending: number }
  | { status: "proposed"; fdcId: number; description: string }
  | { status: "no_candidate" };

/** Overall best-effort time budget for one discovery pass (each search is individually capped too). */
export const DISCOVERY_TIME_BUDGET_MS = 8000;
/** Minimum time between discovery searches for the same food name, to bound USDA API usage. */
export const DISCOVERY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// In-memory last-attempt record for searches that stored no candidates (no rows = no DB
// timestamp to compare against). Per-process best-effort; a restart simply allows one retry.
const emptySearchHistory = new Map<string, number>();

/**
 * True when a scan's nutrition outcome indicates a missing or weak USDA mapping worth
 * discovering review candidates for: nutrition unavailable, or served from the generic /
 * broad approximate tiers. USDA-backed results and portion-only uncertainty do not trigger
 * discovery. Best-effort only — this never changes the nutrition that was served.
 */
export function shouldDiscoverVocabulary(uncertaintyReason: string | null): boolean {
  if (!uncertaintyReason) return false;
  return (
    uncertaintyReason.toLowerCase().includes("nutrition unavailable")
    || uncertaintyReason.startsWith("Generic food reference estimate")
    || uncertaintyReason.startsWith("Broad ")
  );
}

/**
 * Discover plausible USDA mappings and queue them for review.
 * This function never approves mappings or changes meal nutrition.
 */
export async function discoverFoodVocabulary(
  description: string,
  now: number = Date.now(),
): Promise<VocabularyDiscoveryResult> {
  const verified = await findVerifiedFoodMapping(description);
  if (verified) return { status: "already_verified", fdcId: verified.usdaFdcId };

  // A full review set is adequate; a partial set may be topped up once the cooldown elapses,
  // so a single pending candidate never permanently suppresses discovery.
  const pending = await countProposedCandidates(description);
  if (pending >= MAX_FOOD_MAPPING_CANDIDATES) return { status: "candidates_pending", pending };

  const normalized = normalizeFoodDescription(description);
  const lastAttempt = (await latestCandidateCreatedAt(description))?.getTime()
    ?? emptySearchHistory.get(normalized)
    ?? null;
  if (lastAttempt !== null && now - lastAttempt < DISCOVERY_COOLDOWN_MS) {
    return { status: "skipped_cooldown", pending };
  }

  const candidates = await findUsdaMatchCandidates(description, process.env.USDA_FDC_API_KEY, DISCOVERY_TIME_BUDGET_MS);
  if (!candidates.length) {
    // Nothing was stored, so record this attempt in-process to avoid hammering USDA.
    emptySearchHistory.set(normalized, now);
    return { status: "no_candidate" };
  }

  // Store a bounded review set (see MAX_FOOD_MAPPING_CANDIDATES). Candidates are
  // suggestions for human review, not proof of equivalence — nothing is verified here.
  await proposeFoodMappingCandidates(
    description,
    candidates.map((candidate) => ({
      foodDescription: description,
      usdaFdcId: candidate.fdcId,
      usdaDescription: candidate.description,
      usdaDataType: candidate.dataType,
      score: candidate.score,
    })),
  );
  const candidate = candidates[0];
  return { status: "proposed", fdcId: candidate.fdcId, description: candidate.description };
}
