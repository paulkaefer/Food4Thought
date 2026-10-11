import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { envelope } from "@/lib/api/envelope";
import { handleApiError } from "@/lib/api/error-handler";
import { confirmFoodItemSchema } from "@/lib/api/schemas";
import { calculateNutrition } from "@/lib/services/nutrition/calculate-nutrition";
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
    const nutrition = await calculateNutrition(candidate, estimatePortion(candidate));

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
    return NextResponse.json(
      envelope({ status: pending > 0 ? "needs_confirmation" : "identified", message: "Ingredient updated.", data: { foodItem: updated, remainingFlags } }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
