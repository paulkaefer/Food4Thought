import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_REVIEW_COOKIE, isAdminReviewEnabled, isValidAdminToken } from "@/lib/api/admin-auth";
import { collapseToLogicalChoices } from "@/lib/services/nutrition/candidate-dedup";
import { MAX_FOOD_MAPPING_CANDIDATES } from "@/lib/services/nutrition/food-vocabulary";
import { AdminLoginForm } from "./login-form";
import { ReviewBoard, type CandidateView, type MappingGroup } from "./review-board";

/** A stored candidate row before logical-choice collapsing adds membership metadata. */
type RawCandidate = Omit<CandidateView, "memberCount" | "memberFdcIds">;

export const dynamic = "force-dynamic";

/**
 * Admin review interface for USDA mapping candidates. Separate from the meal scan UI;
 * gated by the shared admin token. Nothing here affects live nutrition until a human
 * verifies a candidate.
 */
export default async function FoodMappingReviewPage() {
  if (!isAdminReviewEnabled()) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Food mapping review</h1>
        <p className="text-sm opacity-70">
          Admin review is not configured on this deployment. Set ADMIN_REVIEW_TOKEN to enable it.
        </p>
      </div>
    );
  }

  if (!isValidAdminToken(cookies().get(ADMIN_REVIEW_COOKIE)?.value)) {
    return (
      <div className="max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">Food mapping review</h1>
        <p className="text-sm opacity-70">Enter the admin token to review USDA mapping candidates.</p>
        <AdminLoginForm />
      </div>
    );
  }

  const [candidates, verifiedRows] = await Promise.all([
    prisma.foodMappingCandidate.findMany({ orderBy: [{ normalizedDescription: "asc" }, { score: "desc" }] }),
    prisma.foodVocabulary.findMany({ where: { verificationStatus: "verified" } }),
  ]);
  const verifiedByName = new Map(verifiedRows.map((row) => [row.normalizedDescription, row]));

  const groups: MappingGroup[] = [];
  const byName = new Map<string, { foodDescription: string; verified: MappingGroup["verified"]; raw: RawCandidate[] }>();
  for (const candidate of candidates) {
    let entry = byName.get(candidate.normalizedDescription);
    if (!entry) {
      const verified = verifiedByName.get(candidate.normalizedDescription);
      entry = {
        foodDescription: candidate.foodDescription,
        verified: verified ? { usdaFdcId: verified.usdaFdcId, usdaDescription: verified.usdaDescription } : null,
        raw: [],
      };
      byName.set(candidate.normalizedDescription, entry);
    }
    entry.raw.push({
      id: candidate.id,
      usdaFdcId: candidate.usdaFdcId,
      usdaDescription: candidate.usdaDescription,
      usdaDataType: candidate.usdaDataType,
      score: candidate.score,
      status: candidate.status,
      createdAt: candidate.createdAt.toISOString(),
    });
  }

  // Collapse stored near-duplicates into one logical choice each (records and history are
  // untouched) and show at most MAX_FOOD_MAPPING_CANDIDATES distinct choices per food name.
  for (const [normalizedDescription, entry] of byName) {
    groups.push({
      normalizedDescription,
      foodDescription: entry.foodDescription,
      verified: entry.verified,
      candidates: collapseToLogicalChoices(entry.raw)
        .slice(0, MAX_FOOD_MAPPING_CANDIDATES)
        .map(({ representative, members }) => ({
          ...representative,
          memberCount: members.length,
          memberFdcIds: members.map((member) => member.usdaFdcId),
        })),
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Food mapping review</h1>
      <p className="text-sm opacity-70">
        Proposed USDA matches grouped by identified food. Verifying a candidate replaces any existing verified
        mapping for that food; rejecting preserves history and blocks automatic re-proposal.
      </p>
      <ReviewBoard groups={groups} />
    </div>
  );
}
