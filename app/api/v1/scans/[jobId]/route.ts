import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { envelope } from "@/lib/api/envelope";
import { handleApiError } from "@/lib/api/error-handler";
import { messageFor } from "@/lib/api/messages";

/** GET /api/v1/scans/{jobId} — polled by the client while the Inngest job runs (constitution IV progress feedback). */
export async function GET(_request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const mealLogEntry = await prisma.mealLogEntry.findUnique({
      where: { id: params.jobId },
      include: { foodItems: { include: { allergenLabels: true, dietaryConflictFlags: true } } },
    });

    if (!mealLogEntry) {
      return NextResponse.json(envelope({ status: "error", message: "We couldn't find that scan." }), { status: 404 });
    }

    return NextResponse.json(
      envelope({
        status: mealLogEntry.status,
        message: messageFor(mealLogEntry.status),
        data: { mealLogEntry },
      }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
