import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { envelope } from "@/lib/api/envelope";
import { handleApiError } from "@/lib/api/error-handler";
import { confirmFoodItemSchema } from "@/lib/api/schemas";
import { calculateNutritionWithProvenance, type PreselectedUsdaMatch } from "@/lib/services/nutrition/calculate-nutrition";
import { normalizeFoodDescription } from "@/lib/services/nutrition/food-vocabulary";
import { storedUsdaCandidates } from "@/lib/services/nutrition/meal-candidates";
import { scheduleVocabularyDiscovery } from "@/lib/services/nutrition/schedule-discovery";
import { estimatePortion } from "@/lib/services/vision/estimate-portion";
import type { VisionFoodCandidate } from "@/lib/services/vision/provider";

/**
 * PATCH /api/v1/meal-log-entries/{id}/food-items/{foodItemId} — confirms or corrects an identified
 * food item, recalculating nutrition for the corrected name (FR-013, FR-027), and resolves any
 * dietary-conflict flags the user has explicitly confirmed (FR-018).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; foodItemId: string } },
) {
  try {
    const body = confirmFoodItemSchema.parse(await request.json());

    const existing = await prisma.foodItem.findUnique({ where: { id: params.foodItemId } });
    if (!existing || existing.mealLogEntryId !== params.id) {
      return NextResponse.json(envelope({ status: "error", message: "We couldn't find that food item." }), { status: 404 });
    }

    const nameChanged = normalizeFoodDescription(body.confirmedName) !== normalizeFoodDescription(existing.name);

    // A user-chosen USDA record must come from this ingredient's stored candidate list;
    // re-confirming the same name keeps serving the record it already had.
    let preselected: PreselectedUsdaMatch | undefined;
    if (body.usdaFdcId !== undefined) {
      const chosen = storedUsdaCandidates(existing.usdaCandidates).find((c) => c.fdcId === body.usdaFdcId);
      if (!chosen) {
        return NextResponse.json(
          envelope({ status: "error", message: "That USDA record is not one of this ingredient's candidates." }),
          { status: 400 },
        );
      }
      preselected = { fdcId: chosen.fdcId, description: chosen.description, source: "user_selected" };
    } else if (
      !nameChanged && existing.usdaFdcId && existing.usdaMatchSource && existing.usdaMatchSource !== "verified_mapping"
    ) {
      preselected = {
        fdcId: existing.usdaFdcId,
        description: existing.usdaDescription ?? existing.name,
        source: existing.usdaMatchSource,
      };
    }

    const candidate: VisionFoodCandidate = {
      name: body.confirmedName,
      confidence: 1,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      portionEstimate: {
        amount: existing.portionAmount,
        rangeMin: existing.portionRangeMin,
        rangeMax: existing.portionRangeMax,
        unit: existing.portionUnit,
        isApproximate: existing.portionIsApproximate,
        portionConfidenceWarning: existing.portionConfidenceWarning,
      },
      hasAmbiguousAlternative: false,
      hasHiddenIngredients: false,
    };
    const { estimate: nutrition, usda } = await calculateNutritionWithProvenance(
      candidate,
      estimatePortion(candidate),
      preselected,
    );

    // A user override must actually serve from the chosen record: a failed USDA lookup is an
    // error, not a silent fallback, and the meal is left untouched.
    if (preselected?.source === "user_selected" && usda?.source !== "user_selected") {
      return NextResponse.json(
        envelope({ status: "error", message: "That USDA record is unavailable right now; the meal was not changed." }),
        { status: 502 },
      );
    }

    const updated = await prisma.foodItem.update({
      where: { id: params.foodItemId },
      data: {
        name: body.confirmedName,
        identificationStatus: "confirmed",
        ...({
              calories: nutrition.calories,
              proteinG: nutrition.proteinG,
              carbsG: nutrition.carbsG,
              fatG: nutrition.fatG,
              micronutrients: nutrition.micronutrients,
              nutritionIsApproximate: nutrition.isApproximate,
              uncertaintyReason: nutrition.uncertaintyReason,
            }),
        usdaFdcId: usda?.fdcId ?? null,
        usdaMatchSource: usda?.source ?? null,
        usdaDescription: usda?.description ?? null,
        // Candidate lists belong to the scanned name; a rename makes the stored list stale.
        // Never promoted globally — user selections stay meal-local (no FoodVocabulary write).
        ...(nameChanged ? { usdaCandidates: [] } : {}),
      },
    });

    if (body.resolveConflicts.length > 0) {
      await prisma.dietaryConflictFlag.updateMany({
        where: { id: { in: body.resolveConflicts }, foodItemId: params.foodItemId },
        data: { confirmedByUser: true },
      });
    }

    const remainingFlags = await prisma.dietaryConflictFlag.findMany({
      where: { foodItemId: params.foodItemId, confirmedByUser: false },
    });

    const pending = await prisma.foodItem.count({ where: { mealLogEntryId: params.id, identificationStatus: "pending_user_confirmation" } });
    await prisma.mealLogEntry.update({ where: { id: params.id }, data: { status: pending > 0 ? "needs_confirmation" : "identified" } });

    // User-confirmed names are the strongest vocabulary signal: schedule durable candidate
    // discovery via Inngest. A scheduling failure must never invalidate a successful correction.
    try {
      await scheduleVocabularyDiscovery(body.confirmedName);
    } catch (error) {
      console.warn("[vocabulary] failed to schedule discovery", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return NextResponse.json(
      envelope({ status: pending > 0 ? "needs_confirmation" : "identified", message: "Ingredient updated.", data: { foodItem: updated, remainingFlags } }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
