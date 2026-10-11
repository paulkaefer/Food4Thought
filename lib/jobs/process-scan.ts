import { inngest } from "@/lib/jobs/client";
import type { FailureEventArgs } from "inngest";
import { prisma } from "@/lib/prisma";
import { handleProcessScanFailure } from "@/lib/jobs/process-scan-failure";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";
import { OpenAiFoodVisionProvider } from "@/lib/services/vision/openai-adapter";
import { analyzeWithTimeout } from "@/lib/services/vision/provider";
import { checkImageQuality } from "@/lib/services/ingestion/quality-check";
import { classifyContent } from "@/lib/services/vision/content-classification";
import { generateFunEstimate } from "@/lib/services/vision/fun-estimate";
import { estimatePortion } from "@/lib/services/vision/estimate-portion";
import { calculateNutritionWithProvenance, type PreselectedUsdaMatch } from "@/lib/services/nutrition/calculate-nutrition";
import { discoverFoodVocabulary, shouldDiscoverVocabulary } from "@/lib/services/nutrition/discover-food-vocabulary";
import { normalizeFoodDescription } from "@/lib/services/nutrition/food-vocabulary";
import { assembleMealUsdaCandidates } from "@/lib/services/nutrition/meal-candidates";
import {
  OpenAiUsdaMatchSelector,
  StubUsdaMatchSelector,
  type UsdaMatchSelector,
} from "@/lib/services/nutrition/ai-match-selector";
import { selectNutritionSource } from "@/lib/services/nutrition/select-source";
import { StubRestaurantNutritionProvider } from "@/lib/services/nutrition/restaurant-provider";
import { labelAllergens } from "@/lib/services/restrictions/allergen-labeling";
import { detectConflicts, type DietaryRestrictionType } from "@/lib/services/restrictions/conflict-detection";

const visionProvider = process.env.VISION_PROVIDER === "openai"
  ? new OpenAiFoodVisionProvider()
  : new StubFoodVisionProvider();
const restaurantProvider = new StubRestaurantNutritionProvider();

// USDA match selection is env-gated (default: deterministic stub that abstains, no OpenAI cost).
// To enable locally: USDA_MATCH_SELECTOR=openai plus OPENAI_API_KEY (optional OPENAI_MATCH_MODEL).
const matchSelector: UsdaMatchSelector = process.env.USDA_MATCH_SELECTOR === "openai"
  ? new OpenAiUsdaMatchSelector()
  : new StubUsdaMatchSelector();

/** Payload of the scan/submitted event. */
export interface ProcessScanEventData {
  mealLogEntryId: string;
  photoUrl: string;
  userId: string;
  description?: string;
}

/** Minimal slice of the Inngest step API the pipeline uses, so the core is testable without Inngest. */
export interface ProcessScanStep {
  run<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
}

/**
 * Testable pipeline core, independent of the Inngest wrapper (same pattern as
 * lib/jobs/discover-vocabulary.ts): quality-check -> content-classification ->
 * food-identification -> nutrition calculation -> allergen labeling -> conflict detection.
 */
export async function runProcessScan(data: ProcessScanEventData, step: ProcessScanStep) {
    const { mealLogEntryId, photoUrl, userId, description } = data;

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

    // Bounded, deduplicated USDA candidates per ingredient (stage 3), persisted for later
    // correction and AI selection. Advisory only: failures never change nutrition or the scan.
    const candidateSets = await step.run("assemble-usda-candidates", async () => {
      try {
        return await assembleMealUsdaCandidates(vision.foodCandidates.map((candidate) => candidate.name));
      } catch (error) {
        console.warn("[process-scan] USDA candidate assembly failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    });
    const candidateSetsByName = new Map(
      (candidateSets ?? []).map((set) => [normalizeFoodDescription(set.ingredientName), set]),
    );

    // Stage 5: ONE batched AI selection call per meal, reusing the first analysis's mealContext.
    // Advisory: any failure leaves selections empty and nutrition on the existing fallback chain.
    // Rationales are diagnostics only and are never persisted.
    const selections = await step.run("select-usda-matches", async () => {
      if (!candidateSets) return null;
      try {
        const result = await matchSelector.selectMatches(candidateSets, vision.mealContext, description);
        for (const selection of result.selections) {
          console.info("[process-scan] usda match selection", {
            mealLogEntryId,
            ingredient: selection.ingredientName,
            fdcId: selection.fdcId,
            rationale: selection.rationale,
          });
        }
        return result;
      } catch (error) {
        console.warn("[process-scan] USDA match selection failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    });
    const selectedFdcIdByName = new Map(
      (selections?.selections ?? [])
        .filter((selection) => selection.fdcId !== null)
        .map((selection) => [normalizeFoodDescription(selection.ingredientName), selection.fdcId as number]),
    );

    let needsConfirmation = false;

    for (const candidate of vision.foodCandidates) {
      const portion = estimatePortion(candidate);
      const candidateSet = candidateSetsByName.get(normalizeFoodDescription(candidate.name)) ?? null;
      // A selection applies only when it names an actual candidate of THIS ingredient;
      // verified sets have no candidates, so a stray selection can never override them.
      const selectedFdcId = selectedFdcIdByName.get(normalizeFoodDescription(candidate.name));
      const selectedCandidate = selectedFdcId
        ? candidateSet?.candidates.find((c) => c.fdcId === selectedFdcId)
        : undefined;
      const preselected: PreselectedUsdaMatch | undefined = selectedCandidate
        ? { fdcId: selectedCandidate.fdcId, description: selectedCandidate.description, source: "ai_selected" }
        : undefined;
      const nutritionResult = await step.run(`calculate-nutrition-${candidate.name}`, () =>
        calculateNutritionWithProvenance(candidate, portion, preselected),
      );
      const nutrition = nutritionResult.estimate;
      // What actually served nutrition (an AI selection is dropped if its USDA detail lookup
      // failed). When nothing served and a verified mapping exists, record the mapping of record.
      const serving = nutritionResult.usda
        ?? (candidateSet?.verified
          ? { fdcId: candidateSet.verified.fdcId, description: candidateSet.verified.description, source: "verified_mapping" as const }
          : null);
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
            // USDA match traceability (stage 1/5): the record that actually served nutrition
            // (verified mapping, AI-selected, or name search), plus the assembled candidates
            // for later correction. When assembly itself failed, columns stay at DB defaults.
            ...(candidateSet
              ? {
                  usdaFdcId: serving?.fdcId ?? null,
                  usdaMatchSource: serving?.source ?? null,
                  usdaDescription: serving?.description ?? null,
                  usdaCandidates: candidateSet.candidates,
                }
              : {}),
            allergenLabels: { create: allergens.map((allergen) => ({ allergen })) },
            dietaryConflictFlags: {
              create: conflicts.map((c) => ({ restrictionType: c.restrictionType, reason: c.reason })),
            },
          },
        }),
      );

      // Discovery is advisory only. Keep meal persistence and nutrition unchanged
      // if USDA discovery or vocabulary storage fails. Runs when nutrition was
      // unavailable OR served from a generic/broad approximate reference tier.
      if (shouldDiscoverVocabulary(nutrition.uncertaintyReason)) {
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
}

/**
 * Durable background job for the full scan pipeline. Runs off the request/response cycle so it
 * isn't bound by Vercel's serverless execution limit (research.md #11, constitution IV).
 */
export const processScan = inngest.createFunction(
  {
    id: "process-scan",
    // Retries exhausted: move the entry out of "processing" so polling clients stop and the
    // user sees an actionable terminal message. Conditional on a still-processing row, so a
    // completed scan is never overwritten.
    onFailure: ({ event, error }: FailureEventArgs) => handleProcessScanFailure(event, error),
  },
  { event: "scan/submitted" },
  // Inngest's step.run serializes results (Jsonify<T> at the type level); all step results
  // here are plain JSON data, so the runtime contract matches ProcessScanStep exactly.
  async ({ event, step }) => runProcessScan(event.data as ProcessScanEventData, step as unknown as ProcessScanStep),
);
