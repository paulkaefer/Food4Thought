import type { FoodVisionProvider } from "@/lib/services/vision/provider";

export interface BeforeAfterFoodItem {
  name: string;
  portionGrams: number;
}

export interface PhotoDiffResult {
  consumedFractionByItem: Record<string, number>;
  removalSuspected: boolean;
  addedFoodDetected: boolean;
  requiresUserConfirmation: boolean;
}

/**
 * Re-runs the vision pipeline on the after-photo and matches food identity between before/after to
 * compute consumed/removed/added deltas (FR-021, FR-022, FR-023). Never assumes 100% consumption
 * unless the after-photo is an empty plate.
 */
export async function diffBeforeAfterPhotos(
  visionProvider: FoodVisionProvider,
  beforeItems: BeforeAfterFoodItem[],
  afterPhotoUrl: string,
): Promise<PhotoDiffResult> {
  const afterVision = await visionProvider.analyze(afterPhotoUrl);
  const afterItems = new Map(
    afterVision.foodCandidates.map((c) => [c.name, c.portionEstimate.amount ?? 0]),
  );

  const consumedFractionByItem: Record<string, number> = {};
  let removalSuspected = false;

  for (const before of beforeItems) {
    const afterGrams = afterItems.get(before.name);
    if (afterGrams === undefined) {
      // Item fully missing from the after-photo: could be eaten or removed — never assume consumption (FR-022).
      removalSuspected = true;
      consumedFractionByItem[before.name] = 0;
      continue;
    }
    const consumedGrams = Math.max(0, before.portionGrams - afterGrams);
    consumedFractionByItem[before.name] = before.portionGrams > 0 ? consumedGrams / before.portionGrams : 0;
  }

  const beforeNames = new Set(beforeItems.map((i) => i.name));
  const addedFoodDetected = afterVision.foodCandidates.some((c) => !beforeNames.has(c.name));

  const isEmptyPlate = afterVision.contentClassification === "empty_plate";
  if (isEmptyPlate) {
    for (const before of beforeItems) consumedFractionByItem[before.name] = 1;
    removalSuspected = false;
  }

  return {
    consumedFractionByItem,
    removalSuspected,
    addedFoodDetected,
    requiresUserConfirmation: removalSuspected,
  };
}
