export type RemovalConfirmation = "eaten" | "removed_not_eaten";

/**
 * Resolves a removalSuspected flag once the user confirms what actually happened (FR-022). The
 * caller is responsible for persisting the resulting fraction on the ConsumptionRecord.
 */
export function resolveRemovalConfirmation(confirmation: RemovalConfirmation): { consumedFraction: number } {
  return { consumedFraction: confirmation === "eaten" ? 1 : 0 };
}
