import { approximatePortion, exactPortion } from "@/lib/models/portion-estimate";
import type { FoodVisionProvider, VisionResult } from "./provider";

/**
 * Fixture-driven stub adapter used for local development, contract tests, and until a real vendor
 * is wired up behind FoodVisionProvider. Selection is based on filename/URL hints so fixtures are
 * deterministic in tests (see tests/contract/fixtures).
 */
export class StubFoodVisionProvider implements FoodVisionProvider {
  async analyze(photoUrl: string): Promise<VisionResult> {
    const hint = photoUrl.toLowerCase();

    if (hint.includes("non-food")) {
      return { contentClassification: "non_food", isLowQuality: false, foodCandidates: [] };
    }
    if (hint.includes("blurry")) {
      return { contentClassification: "food", isLowQuality: true, foodCandidates: [] };
    }
    if (hint.includes("empty-plate")) {
      return { contentClassification: "empty_plate", isLowQuality: false, foodCandidates: [] };
    }
    if (hint.includes("multi-item")) {
      return {
        contentClassification: "food",
        isLowQuality: false,
        foodCandidates: [
          {
            name: "grilled chicken",
            confidence: 0.92,
            boundingBox: { x: 0, y: 0, width: 100, height: 100 },
            portionEstimate: exactPortion(150),
            hasAmbiguousAlternative: false,
            hasHiddenIngredients: false,
          },
          {
            name: "rice",
            confidence: 0.9,
            boundingBox: { x: 100, y: 0, width: 100, height: 100 },
            portionEstimate: exactPortion(120),
            hasAmbiguousAlternative: false,
            hasHiddenIngredients: false,
          },
          {
            name: "broccoli",
            confidence: 0.88,
            boundingBox: { x: 200, y: 0, width: 100, height: 100 },
            portionEstimate: exactPortion(80),
            hasAmbiguousAlternative: false,
            hasHiddenIngredients: false,
          },
        ],
      };
    }
    if (hint.includes("ambiguous-portion")) {
      return {
        contentClassification: "food",
        isLowQuality: false,
        foodCandidates: [
          {
            name: "pasta",
            confidence: 0.85,
            boundingBox: { x: 0, y: 0, width: 100, height: 100 },
            portionEstimate: approximatePortion(200, 350),
            hasAmbiguousAlternative: false,
            hasHiddenIngredients: false,
          },
        ],
      };
    }
    if (hint.includes("hidden-ingredients")) {
      return {
        contentClassification: "food",
        isLowQuality: false,
        foodCandidates: [
          {
            name: "burger",
            confidence: 0.87,
            boundingBox: { x: 0, y: 0, width: 100, height: 100 },
            portionEstimate: exactPortion(300),
            hasAmbiguousAlternative: false,
            hasHiddenIngredients: true,
          },
        ],
      };
    }
    if (hint.includes("visually-similar")) {
      return {
        contentClassification: "food",
        isLowQuality: false,
        foodCandidates: [
          {
            name: "mashed potatoes",
            confidence: 0.55,
            boundingBox: { x: 0, y: 0, width: 100, height: 100 },
            portionEstimate: exactPortion(180),
            hasAmbiguousAlternative: true,
            hasHiddenIngredients: false,
          },
        ],
      };
    }

    // Default: clear single-food photo (e.g. "single-food"/apple fixtures)
    return {
      contentClassification: "food",
      isLowQuality: false,
      foodCandidates: [
        {
          name: "apple",
          confidence: 0.97,
          boundingBox: { x: 0, y: 0, width: 100, height: 100 },
          portionEstimate: exactPortion(182),
          hasAmbiguousAlternative: false,
          hasHiddenIngredients: false,
        },
      ],
    };
  }
}
