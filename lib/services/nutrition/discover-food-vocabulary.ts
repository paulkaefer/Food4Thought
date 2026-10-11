import { findUsdaMatchCandidates } from "./usda-match-candidates";
import { findVerifiedFoodMapping, proposeFoodMapping } from "./food-vocabulary";

export type VocabularyDiscoveryResult =
  | { status: "already_verified"; fdcId: number }
  | { status: "proposed"; fdcId: number; description: string }
  | { status: "no_candidate" };

/**
 * Discover a possible USDA mapping and queue it for review.
 * This function never approves mappings or changes meal nutrition.
 */
export async function discoverFoodVocabulary(description: string): Promise<VocabularyDiscoveryResult> {
  const verified = await findVerifiedFoodMapping(description);
  if (verified) return { status: "already_verified", fdcId: verified.usdaFdcId };

  const candidates = await findUsdaMatchCandidates(description);
  if (!candidates.length) return { status: "no_candidate" };

  // Highest-ranked candidate is a suggestion, not proof of equivalence.
  const candidate = candidates[0];
  await proposeFoodMapping({
    foodDescription: description,
    usdaFdcId: candidate.fdcId,
    usdaDescription: candidate.description,
    usdaDataType: candidate.dataType,
  });
  return { status: "proposed", fdcId: candidate.fdcId, description: candidate.description };
}
