import { inngest } from "./client";
import { discoverFoodVocabulary } from "@/lib/services/nutrition/discover-food-vocabulary";

/**
 * Testable core, independent of the Inngest wrapper. Errors propagate so Inngest
 * can retry transient failures; discovery itself never changes meal nutrition.
 */
export async function runVocabularyDiscovery(data: { description?: string }) {
  const description = data.description?.trim();
  if (!description) return { status: "invalid" as const };
  return discoverFoodVocabulary(description);
}

/** Durable vocabulary discovery triggered by user-confirmed ingredient corrections. */
export const discoverVocabulary = inngest.createFunction(
  { id: "discover-vocabulary" },
  { event: "vocabulary/discover" },
  async ({ event }) => runVocabularyDiscovery(event.data as { description?: string }),
);
