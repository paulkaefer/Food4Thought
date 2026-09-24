import type { PortionEstimate } from "@/lib/models/portion-estimate";

export type ContentClassification = "food" | "non_food" | "empty_plate";

export interface VisionFoodCandidate {
  name: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  portionEstimate: PortionEstimate;
  /** true when a second, visually-similar food with different nutrition was a close runner-up (FR-013) */
  hasAmbiguousAlternative: boolean;
  /** true when the dish likely has hidden/unclear ingredients, e.g. sauces or mixed dishes (FR-012) */
  hasHiddenIngredients: boolean;
}

export interface VisionResult {
  contentClassification: ContentClassification;
  /** true when the photo is too blurry/poorly lit to identify anything reliably (FR-008) */
  isLowQuality: boolean;
  foodCandidates: VisionFoodCandidate[];
}

/** Vendor-agnostic boundary around whatever food-recognition service is configured at deploy time (research.md #1). */
export interface FoodVisionProvider {
  analyze(photoUrl: string): Promise<VisionResult>;
}

export class VisionProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "VisionProviderError";
    this.cause = options?.cause;
  }
}

/** Wraps any FoodVisionProvider call with a timeout so a slow external service never hangs the pipeline (constitution I). */
export async function analyzeWithTimeout(
  provider: FoodVisionProvider,
  photoUrl: string,
  timeoutMs = 8000,
): Promise<VisionResult> {
  return Promise.race([
    provider.analyze(photoUrl),
    new Promise<VisionResult>((_, reject) =>
      setTimeout(() => reject(new VisionProviderError("Vision provider timed out")), timeoutMs),
    ),
  ]).catch((error) => {
    throw error instanceof VisionProviderError ? error : new VisionProviderError("Vision provider call failed", { cause: error });
  });
}
