import { prisma } from "@/lib/prisma";

/** The slice of the Inngest "inngest/function.failed" event payload this handler reads. */
export interface ProcessScanFailureEvent {
  data?: {
    event?: { data?: unknown };
  };
}

/**
 * Runs when the scan pipeline has exhausted its Inngest retries. Moves the entry out of
 * "processing" so polling clients stop and the user gets an actionable terminal message
 * instead of progress UI that never ends.
 *
 * The schema has no failure status and none may be added, so this reuses the existing
 * rejected_low_quality terminal status: the photo could not be analyzed, and the user is
 * asked to try again. The update is conditional on the row still being "processing", so a
 * scan that already reached a terminal (successful) status is never overwritten.
 */
export async function handleProcessScanFailure(
  failureEvent: ProcessScanFailureEvent,
  error: unknown,
): Promise<void> {
  const mealLogEntryId = (failureEvent.data?.event?.data as { mealLogEntryId?: unknown } | undefined)
    ?.mealLogEntryId;
  if (typeof mealLogEntryId !== "string" || mealLogEntryId.length === 0) {
    console.error("[process-scan] failure event carried no mealLogEntryId", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return;
  }

  console.error("[process-scan] retries exhausted", {
    mealLogEntryId,
    error: error instanceof Error ? error.message : "Unknown error",
  });

  await prisma.mealLogEntry.updateMany({
    where: { id: mealLogEntryId, status: "processing" },
    data: { status: "rejected_low_quality" },
  });
}
