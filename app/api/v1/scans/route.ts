import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { envelope } from "@/lib/api/envelope";
import { handleApiError } from "@/lib/api/error-handler";
import { messageFor } from "@/lib/api/messages";
import { scanRequestSchema } from "@/lib/api/schemas";
import { uploadRejectionMessage, validateUpload } from "@/lib/services/ingestion/validate-upload";
import { storePhoto } from "@/lib/services/ingestion/photo-storage";
import { inngest } from "@/lib/jobs/client";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/v1/scans — validates the upload, stores the photo, and dispatches an Inngest job so
 * the potentially-slow vision-provider call never blocks this route handler (constitution IV).
 */
export async function POST(request: NextRequest) {
  const receivedAt = Date.now();
  try {
    const formData = await request.formData();
    const photo = formData.get("photo");

    if (!(photo instanceof Blob)) {
      return NextResponse.json(
        envelope({ status: "rejected_invalid_file", message: uploadRejectionMessage("empty_or_corrupted") }),
        { status: 400 },
      );
    }

    const validation = validateUpload({ type: photo.type, size: photo.size });
    if (!validation.ok) {
      return NextResponse.json(
        envelope({ status: "rejected_invalid_file", message: uploadRejectionMessage(validation.reason) }),
        { status: 400 },
      );
    }

    const parsed = scanRequestSchema.parse({
      mode: formData.get("mode") ?? undefined,
      linkedMealLogEntryId: formData.get("linkedMealLogEntryId") ?? undefined,
    });

    const fileName = (photo as File).name ?? "upload";
    const { url } = await storePhoto(photo, `scans/${randomUUID()}-${fileName}`);

    if (parsed.mode === "after") {
      // Attaching an after-photo to an existing entry — the client follows up with
      // POST /consumption/photo-diff to compute the consumed/removed/added delta.
      if (!parsed.linkedMealLogEntryId) {
        return NextResponse.json(
          envelope({ status: "rejected_invalid_file", message: "An after-photo needs a linkedMealLogEntryId." }),
          { status: 400 },
        );
      }
      await prisma.mealLogEntry.update({
        where: { id: parsed.linkedMealLogEntryId },
        data: { afterPhotoUrl: url },
      });
      return NextResponse.json(
        envelope({ status: "ok", message: "After-photo received.", data: { photoUrl: url } }),
      );
    }

    const mealLogEntry = await prisma.mealLogEntry.create({
      data: {
        userId: DEV_USER_ID,
        beforePhotoUrl: url,
        status: "processing",
      },
    });

    await inngest.send({
      name: "scan/submitted",
      data: { mealLogEntryId: mealLogEntry.id, photoUrl: url, userId: DEV_USER_ID },
    });

    // Latency from request-received to job-dispatched, tracked toward the SC-001 p95 target (constitution IV).
    console.info(`[scans] mealLogEntryId=${mealLogEntry.id} dispatchMs=${Date.now() - receivedAt}`);

    return NextResponse.json(
      envelope({ status: "processing", message: messageFor("processing"), data: { jobId: mealLogEntry.id } }),
      { status: 202 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
