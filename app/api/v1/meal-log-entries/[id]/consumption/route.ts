import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { envelope } from "@/lib/api/envelope";
import { handleApiError } from "@/lib/api/error-handler";
import { consumptionRequestSchema } from "@/lib/api/schemas";
import { scaleMealConsumption } from "@/lib/services/consumption/scale-nutrition";

/**
 * POST /api/v1/meal-log-entries/{id}/consumption — records whole-meal or per-item consumption and
 * recalculates totals by scaling every nutrient field, not just calories (FR-019, FR-020).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = consumptionRequestSchema.parse(await request.json());
    const foodItems = await prisma.foodItem.findMany({ where: { mealLogEntryId: params.id } });

    const fractionByItemId = new Map<string, number>();
    if (body.method === "manual_fraction") {
      for (const item of foodItems) fractionByItemId.set(item.id, body.consumedFraction);
    } else {
      for (const entry of body.items) fractionByItemId.set(entry.foodItemId, entry.consumedFraction);
    }

    await prisma.$transaction(
      Array.from(fractionByItemId.entries()).map(([foodItemId, consumedFraction]) =>
        prisma.foodItem.update({ where: { id: foodItemId }, data: { consumptionFraction: consumedFraction } }),
      ),
    );

    await prisma.consumptionRecord.create({
      data: {
        mealLogEntryId: params.id,
        method: body.method,
        consumedFraction: body.method === "manual_fraction" ? body.consumedFraction : 1,
      },
    });

    const totals = scaleMealConsumption(
      foodItems.map((item) => ({
        foodItemId: item.id,
        consumedFraction: fractionByItemId.get(item.id) ?? 0,
        nutrition: {
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          micronutrients: (item.micronutrients as Record<string, number>) ?? {},
          isApproximate: item.nutritionIsApproximate,
          uncertaintyReason: item.uncertaintyReason,
        },
      })),
    );

    return NextResponse.json(envelope({ status: "identified", message: "Consumption recorded!", data: { totals } }));
  } catch (error) {
    return handleApiError(error);
  }
}
