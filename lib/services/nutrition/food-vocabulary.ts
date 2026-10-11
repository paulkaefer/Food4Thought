import { prisma } from "@/lib/prisma";

/** A verified mapping is an index into USDA, not a copy of nutrient values. */
export interface VerifiedFoodMapping {
  normalizedDescription: string;
  foodDescription: string;
  usdaFdcId: number;
  usdaDescription: string;
  usdaDataType: string;
}

export function normalizeFoodDescription(value: string): string {
  return value.toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Returns only approved mappings. Proposed/rejected entries must never
 * influence automatic nutrition selection.
 */
export async function findVerifiedFoodMapping(description: string): Promise<VerifiedFoodMapping | null> {
  const normalizedDescription = normalizeFoodDescription(description);
  if (!normalizedDescription) return null;

  const mapping = await prisma.foodVocabulary.findUnique({
    where: { normalizedDescription },
  });
  if (!mapping || mapping.verificationStatus !== "verified") return null;

  await prisma.foodVocabulary.update({
    where: { id: mapping.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {
    // Usage telemetry must never prevent a valid vocabulary lookup.
  });

  return {
    normalizedDescription: mapping.normalizedDescription,
    foodDescription: mapping.foodDescription,
    usdaFdcId: mapping.usdaFdcId,
    usdaDescription: mapping.usdaDescription,
    usdaDataType: mapping.usdaDataType,
  };
}

/**
 * Save a candidate for review; never automatically mark it verified.
 * A separate validation/review workflow will approve candidates later.
 */
export async function proposeFoodMapping(mapping: Omit<VerifiedFoodMapping, "normalizedDescription">): Promise<void> {
  const normalizedDescription = normalizeFoodDescription(mapping.foodDescription);
  if (!normalizedDescription || !Number.isSafeInteger(mapping.usdaFdcId) || mapping.usdaFdcId <= 0) {
    throw new Error("Invalid food vocabulary proposal");
  }
  // Do not overwrite existing proposals, rejected mappings, or verified mappings.
  // Unique constraint also protects against concurrent duplicate submissions.
  await prisma.foodVocabulary.create({
    data: {
      normalizedDescription,
      foodDescription: mapping.foodDescription,
      usdaFdcId: mapping.usdaFdcId,
      usdaDescription: mapping.usdaDescription,
      usdaDataType: mapping.usdaDataType,
      verificationStatus: "proposed",
    },
  }).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return;
    throw error;
  });
}
