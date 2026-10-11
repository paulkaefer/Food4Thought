import { prisma } from "@/lib/prisma";
import { candidateEquivalenceKey } from "./candidate-dedup";

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

/** Maximum USDA candidates stored per food name, keeping the review queue bounded and score-ordered. */
export const MAX_FOOD_MAPPING_CANDIDATES = 5;

export interface FoodMappingCandidateInput {
  foodDescription: string;
  usdaFdcId: number;
  usdaDescription: string;
  usdaDataType: string;
  score?: number;
}

/** Rejected USDA record IDs for a food name — preserved history that must never be re-proposed automatically. */
export async function listRejectedCandidateIds(description: string): Promise<Set<number>> {
  const normalizedDescription = normalizeFoodDescription(description);
  if (!normalizedDescription) return new Set();
  const rows = await prisma.foodMappingCandidate.findMany({
    where: { normalizedDescription, status: "rejected" },
    select: { usdaFdcId: true },
  });
  return new Set(rows.map((row) => row.usdaFdcId));
}

/**
 * Count of pending (proposed, not yet reviewed) logical choices for a food name.
 * Near-duplicate USDA records (e.g. choice/select grade variants of one cut) collapse
 * to a single choice, so a review set full of duplicates does not suppress discovery.
 */
export async function countProposedCandidates(description: string): Promise<number> {
  const normalizedDescription = normalizeFoodDescription(description);
  if (!normalizedDescription) return 0;
  const rows = await prisma.foodMappingCandidate.findMany({
    where: { normalizedDescription, status: "proposed" },
    select: { usdaDescription: true },
  });
  return new Set(rows.map((row) => candidateEquivalenceKey(row.usdaDescription))).size;
}

/** Most recent candidate creation time for a food name (any status), used for discovery cooldowns. */
export async function latestCandidateCreatedAt(description: string): Promise<Date | null> {
  const normalizedDescription = normalizeFoodDescription(description);
  if (!normalizedDescription) return null;
  const row = await prisma.foodMappingCandidate.findFirst({
    where: { normalizedDescription },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/**
 * Store a bounded set of meaningfully distinct USDA candidates for human review.
 * Never verifies anything, never overwrites an existing row, and never re-proposes
 * a record that review has already rejected for this food name. Records equivalent
 * to an already-stored active (proposed/verified) row — or to one proposed earlier
 * in the same batch — are the same logical choice and are skipped, so the queue is
 * not crowded with redundant Verify/Reject controls. Rejected rows block only their
 * exact FDC ID: rejecting one record never blocks a different USDA record.
 */
export async function proposeFoodMappingCandidates(
  description: string,
  candidates: FoodMappingCandidateInput[],
): Promise<{ proposed: number; skipped: number }> {
  const normalizedDescription = normalizeFoodDescription(description);
  if (!normalizedDescription || !candidates.length) return { proposed: 0, skipped: 0 };

  const [rejected, activeRows] = await Promise.all([
    listRejectedCandidateIds(description),
    prisma.foodMappingCandidate.findMany({
      where: { normalizedDescription, status: { in: ["proposed", "verified"] } },
      select: { usdaDescription: true },
    }),
  ]);
  const equivalenceKeys = new Set(activeRows.map((row) => candidateEquivalenceKey(row.usdaDescription)));

  let proposed = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    if (proposed >= MAX_FOOD_MAPPING_CANDIDATES) break;
    if (!Number.isSafeInteger(candidate.usdaFdcId) || candidate.usdaFdcId <= 0 || rejected.has(candidate.usdaFdcId)) {
      skipped++;
      continue;
    }
    const key = candidateEquivalenceKey(candidate.usdaDescription);
    if (equivalenceKeys.has(key)) {
      skipped++;
      continue;
    }
    try {
      await prisma.foodMappingCandidate.create({
        data: {
          normalizedDescription,
          foodDescription: candidate.foodDescription,
          usdaFdcId: candidate.usdaFdcId,
          usdaDescription: candidate.usdaDescription,
          usdaDataType: candidate.usdaDataType,
          score: candidate.score ?? 0,
          status: "proposed",
        },
      });
      proposed++;
      equivalenceKeys.add(key);
    } catch (error: unknown) {
      // Duplicate (same food name + same USDA record) — keep the existing row untouched.
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        skipped++;
        continue;
      }
      throw error;
    }
  }
  return { proposed, skipped };
}

export interface ReviewedMapping {
  normalizedDescription: string;
  usdaFdcId: number;
}

/**
 * Human verification: promote a candidate into the authoritative FoodVocabulary table.
 * Atomic: upserts the verified mapping (verifiedBy human, replacing any existing
 * verified or rejected mapping for that food name), demotes any other verified
 * candidate for the same name, and marks this candidate verified. Never called
 * automatically — only from the admin review API.
 */
export async function verifyFoodMappingCandidate(candidateId: string): Promise<ReviewedMapping> {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.foodMappingCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new Error("Candidate not found");
    if (candidate.status === "rejected") throw new Error("A rejected candidate cannot be verified");

    const now = new Date();
    await tx.foodVocabulary.upsert({
      where: { normalizedDescription: candidate.normalizedDescription },
      create: {
        normalizedDescription: candidate.normalizedDescription,
        foodDescription: candidate.foodDescription,
        usdaFdcId: candidate.usdaFdcId,
        usdaDescription: candidate.usdaDescription,
        usdaDataType: candidate.usdaDataType,
        verificationStatus: "verified",
        verifiedBy: "human",
      },
      update: {
        foodDescription: candidate.foodDescription,
        usdaFdcId: candidate.usdaFdcId,
        usdaDescription: candidate.usdaDescription,
        usdaDataType: candidate.usdaDataType,
        verificationStatus: "verified",
        verifiedBy: "human",
      },
    });
    await tx.foodMappingCandidate.updateMany({
      where: { normalizedDescription: candidate.normalizedDescription, status: "verified", id: { not: candidate.id } },
      data: { status: "proposed", reviewedAt: now },
    });
    await tx.foodMappingCandidate.update({
      where: { id: candidate.id },
      data: { status: "verified", reviewedAt: now },
    });
    return { normalizedDescription: candidate.normalizedDescription, usdaFdcId: candidate.usdaFdcId };
  });
}

/**
 * Reject a candidate: the row is preserved as history, and the composite uniqueness
 * (normalizedDescription + usdaFdcId) plus the rejected-ID filter in
 * proposeFoodMappingCandidates prevent automatic re-proposal. Rejecting the live
 * verified candidate also revokes the authoritative mapping, so a rejected record
 * never keeps serving nutrition.
 */
export async function rejectFoodMappingCandidate(candidateId: string): Promise<ReviewedMapping> {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.foodMappingCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new Error("Candidate not found");

    const now = new Date();
    await tx.foodMappingCandidate.update({
      where: { id: candidate.id },
      data: { status: "rejected", reviewedAt: now },
    });
    if (candidate.status === "verified") {
      await tx.foodVocabulary.updateMany({
        where: {
          normalizedDescription: candidate.normalizedDescription,
          usdaFdcId: candidate.usdaFdcId,
          verificationStatus: "verified",
        },
        data: { verificationStatus: "rejected", verifiedBy: null },
      });
    }
    return { normalizedDescription: candidate.normalizedDescription, usdaFdcId: candidate.usdaFdcId };
  });
}
