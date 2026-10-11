import { inngest } from "@/lib/jobs/client";
import { prisma } from "@/lib/prisma";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { OpenAiFoodVisionProvider } from "@/lib/services/vision/openai-adapter";
import { analyzeWithTimeout } from "@/lib/services/vision/provider";
import { checkImageQuality } from "@/lib/services/ingestion/quality-check";
import { classifyContent } from "@/lib/services/vision/content-classification";
import { generateFunEstimate } from "@/lib/services/vision/fun-estimate";
import { estimatePortion } from "@/lib/services/vision/estimate-portion";
import { calculateNutrition } from "@/lib/services/nutrition/calculate-nutrition";
import { discoverFoodVocabulary } from "@/lib/services/nutrition/discover-food-vocabulary";
import { selectNutritionSource } from "@/lib/services/nutrition/select-source";
import { StubRestaurantNutritionProvider } from "@/lib/services/nutrition/restaurant-provider";
import { labelAllergens } from "@/lib/services/restrictions/allergen-labeling";
import { detectConflicts, type DietaryRestrictionType } from "@/lib/services/restrictions/conflict-detection";

const visionProvider = process.env.VISION_PROVIDER === "openai"
  ? new OpenAiFoodVisionProvider()
  : new StubFoodVisionProvider();
const restaurantProvider = new StubRestaurantNutritionProvider();

/**
 * Durable background job for the full scan pipeline: quality-check -> content-classification ->
 * food-identification -> nutrition calculation -> allergen labeling -> conflict detection.
 * Runs off the request/response cycle so it isn't bound by Vercel's serverless execution limit
 * (research.md #11, constitution IV).
 */
export const processScan = inngest.createFunction(
  { id: "process-scan" },
  { event: "scan/submitted" },
  async ({ event, step }) => {
    const { mealLogEntryId, photoUrl, userId, description } = event.data as {
      mealLogEntryId: string;
      photoUrl: string;
      userId: string;
      description?: string;
    };

    // p95 latency instrumentation for the scan pipeline (SC-001, constitution IV).
    const startedAt = Date.now();
    const logDuration = (status: string) => {
      console.info(`[process-scan] mealLogEntryId=${mealLogEntryId} status=${status} durationMs=${Date.now() - startedAt}`);
    };

    const vision = await step.run("analyze-photo", () => analyzeWithTimeout(visionProvider, photoUrl, 30000, description));

    const { passesQuality } = checkImageQuality(vision);
    if (!passesQuality) {
      await step.run("persist-low-quality", () =>
        prisma.mealLogEntry.update({ where: { id: mealLogEntryId }, data: { status: "rejected_low_quality" } }),
      );
      logDuration("rejected_low_quality");
      return { status: "rejected_low_quality" };
    }

    const classification = classifyContent(vision);

    if (classification === "non_food") {
      const fun = generateFunEstimate(photoUrl);
      await step.run("persist-non-food", () =>
        prisma.mealLogEntry.update({
          where: { id: mealLogEntryId },
          data: { status: "rejected_non_food", isFunEstimate: true },
        }),
      );
      logDuration("rejected_non_food");
      return { status: "rejected_non_food", funEstimate: fun };
    }

    if (classification === "empty_plate") {
      await step.run("persist-empty-plate", () =>
        prisma.mealLogEntry.update({ where: { id: mealLogEntryId }, data: { status: "empty_plate" } }),
      );
      logDuration("empty_plate");
      return { status: "empty_plate" };
    }

    const restrictions = await step.run("load-restrictions", async () => {
      const rows = await prisma.dietaryRestriction.findMany({ where: { userId } });
      return rows.map((r) => r.type as DietaryRestrictionType);
    });

    let needsConfirmation = false;

    for (const candidate of vision.foodCandidates) {
      const portion = estimatePortion(candidate);
      const nutrition = await step.run(`calculate-nutrition-${candidate.name}`, () =>
        calculateNutrition(candidate, portion),
      );
      const source = await step.run(`select-source-${candidate.name}`, () =>
        selectNutritionSource(candidate.name, restaurantProvider),
      );
      const allergens = labelAllergens(candidate.name);
      const conflicts = detectConflicts(candidate.name, allergens, restrictions);

      if (candidate.hasAmbiguousAlternative || conflicts.length > 0) needsConfirmation = true;

      await step.run(`persist-food-item-${candidate.name}`, () =>
        prisma.foodItem.create({
          data: {
            mealLogEntryId,
            name: candidate.name,
            confidence: candidate.confidence,
            identificationStatus: candidate.hasAmbiguousAlternative ? "pending_user_confirmation" : "confirmed",
            dataSource: source.dataSource,
            portionAmount: portion.amount,
            portionRangeMin: portion.rangeMin,
            portionRangeMax: portion.rangeMax,
            portionUnit: portion.unit,
            portionIsApproximate: portion.isApproximate,
            portionConfidenceWarning: portion.portionConfidenceWarning,
            calories: nutrition.calories,
            proteinG: nutrition.proteinG,
            carbsG: nutrition.carbsG,
            fatG: nutrition.fatG,
            micronutrients: nutrition.micronutrients,
            nutritionIsApproximate: nutrition.isApproximate,
            uncertaintyReason: nutrition.uncertaintyReason,
            allergenLabels: { create: allergens.map((allergen) => ({ allergen })) },
            dietaryConflictFlags: {
              create: conflicts.map((c) => ({ restrictionType: c.restrictionType, reason: c.reason })),
            },
          },
        }),
      );

      // Discovery is advisory only. Keep meal persistence and nutrition unchanged
      // if USDA discovery or vocabulary storage fails.
      if (nutrition.uncertaintyReason?.includes("Nutrition unavailable: no verified USDA match") ||
          nutrition.uncertaintyReason?.includes("nutrition unavailable without a verified USDA match")) {
        await step.run(`discover-vocabulary-${candidate.name}`, async () => {
          try {
            return await discoverFoodVocabulary(candidate.name);
          } catch (error) {
            console.warn("[process-scan] Vocabulary discovery failed", {
              food: candidate.name,
              error: error instanceof Error ? error.message : "Unknown error",
            });
            return { status: "discovery_failed" };
          }
        });
      }
    }

    const finalStatus = needsConfirmation ? "needs_confirmation" : "identified";
    await step.run("persist-final-status", () =>
      prisma.mealLogEntry.update({ where: { id: mealLogEntryId }, data: { status: finalStatus } }),
    );

    logDuration(finalStatus);
    return { status: finalStatus };
  },
);
