import type { VisionFoodCandidate } from "@/lib/services/vision/provider";
import type { PortionEstimate } from "@/lib/models/portion-estimate";

/** Returns the portion estimate the vision provider already produced (FR-005): actual visible size, never a default serving. */
export function estimatePortion(candidate: VisionFoodCandidate): PortionEstimate {
  return candidate.portionEstimate;
}

/** Reference amount (grams) used to scale per-100g nutrition data, using the midpoint of a range when the amount isn't exact. */
export function portionReferenceGrams(portion: PortionEstimate): number {
  if (portion.amount !== null) return portion.amount;
  if (portion.rangeMin !== null && portion.rangeMax !== null) return (portion.rangeMin + portion.rangeMax) / 2;
  return 100; // unreliable portion: fall back to a neutral 100g reference until the user confirms
}
