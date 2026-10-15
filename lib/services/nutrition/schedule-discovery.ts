import { inngest } from "@/lib/jobs/client";

/**
 * Durable, best-effort vocabulary discovery for user-confirmed ingredient names.
 * Schedules an Inngest event so discovery survives the request lifecycle. Never throws —
 * a scheduling failure must never invalidate an otherwise successful ingredient correction.
 */
export async function scheduleVocabularyDiscovery(description: string): Promise<void> {
  try {
    await inngest.send({ name: "vocabulary/discover", data: { description } });
  } catch (error) {
    console.warn("[vocabulary] failed to schedule discovery", {
      description,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
