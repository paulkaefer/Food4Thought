import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { envelope } from "@/lib/api/envelope";
import { handleApiError } from "@/lib/api/error-handler";
import { diffBeforeAfterPhotos } from "@/lib/services/consumption/photo-diff";
import { StubFoodVisionProvider } from "@/lib/services/vision/stub-adapter";

const visionProvider = new StubFoodVisionProvider();

/**
 * POST /api/v1/meal-log-entries/{id}/consumption/photo-diff — compares before/after photos and
 * reports the consumed/removed/added delta (FR-021, FR-022, FR-023), never assuming full
 * consumption unless the after-photo is an empty plate.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { afterPhotoUrl } = (await request.json()) as { afterPhotoUrl: string };

    const mealLogEntry = await prisma.mealLogEntry.findUnique({
      where: { id: params.id },
      include: { foodItems: true },
    });
    if (!mealLogEntry) {
      return NextResponse.json(envelope({ status: "error", message: "We couldn't find that meal." }), { status: 404 });
    }

    const diff = await diffBeforeAfterPhotos(
      visionProvider,
      mealLogEntry.foodItems.map((item) => ({ name: item.name, portionGrams: item.portionAmount ?? 100 })),
      afterPhotoUrl,
    );

    await prisma.mealLogEntry.update({ where: { id: params.id }, data: { afterPhotoUrl } });
    await prisma.consumptionRecord.create({
      data: {
        mealLogEntryId: params.id,
        method: "photo_comparison",
        consumedFraction:
          Object.values(diff.consumedFractionByItem).reduce((a, b) => a + b, 0) /
          Math.max(1, Object.keys(diff.consumedFractionByItem).length),
        derivedFromAfterPhotoUrl: afterPhotoUrl,
        removalSuspected: diff.removalSuspected,
        addedFoodDetected: diff.addedFoodDetected,
      },
    });

    return NextResponse.json(
      envelope({
        status: "identified",
        message: diff.requiresUserConfirmation
          ? "Looks like some food disappeared — did you eat it, or was it cleared away?"
          : "Here's what we think you ate!",
        data: diff,
      }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
