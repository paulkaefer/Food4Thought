import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { envelope } from "@/lib/api/envelope";
import { handleApiError } from "@/lib/api/error-handler";
import { hasAdminReviewAccess, isAdminReviewEnabled } from "@/lib/api/admin-auth";
import { rejectFoodMappingCandidate, verifyFoodMappingCandidate } from "@/lib/services/nutrition/food-vocabulary";

const reviewSchema = z.object({
  candidateId: z.string().uuid(),
  action: z.enum(["verify", "reject"]),
});

function disabled() {
  return NextResponse.json(
    envelope({ status: "error", message: "Admin review is not configured on this deployment." }),
    { status: 503 },
  );
}

function unauthorized() {
  return NextResponse.json(envelope({ status: "error", message: "Admin authentication required." }), { status: 401 });
}

/** GET /api/v1/admin/food-mappings — list candidates grouped by food name plus current verified mappings. */
export async function GET(request: NextRequest) {
  if (!isAdminReviewEnabled()) return disabled();
  if (!hasAdminReviewAccess(request)) return unauthorized();

  const [candidates, verified] = await Promise.all([
    prisma.foodMappingCandidate.findMany({ orderBy: [{ normalizedDescription: "asc" }, { score: "desc" }] }),
    prisma.foodVocabulary.findMany({ where: { verificationStatus: "verified" } }),
  ]);
  return NextResponse.json(
    envelope({
      status: "ok",
      message: "Food mapping candidates",
      data: {
        candidates: candidates.map((c) => ({
          id: c.id,
          normalizedDescription: c.normalizedDescription,
          foodDescription: c.foodDescription,
          usdaFdcId: c.usdaFdcId,
          usdaDescription: c.usdaDescription,
          usdaDataType: c.usdaDataType,
          score: c.score,
          status: c.status,
          createdAt: c.createdAt.toISOString(),
        })),
        verified: verified.map((v) => ({
          normalizedDescription: v.normalizedDescription,
          usdaFdcId: v.usdaFdcId,
          usdaDescription: v.usdaDescription,
          verifiedBy: v.verifiedBy,
        })),
      },
    }),
  );
}

/**
 * POST /api/v1/admin/food-mappings — verify or reject a candidate.
 * The SameSite=Strict cookie plus this custom header keeps cross-site form posts from triggering mutations.
 */
export async function POST(request: NextRequest) {
  if (!isAdminReviewEnabled()) return disabled();
  if (!hasAdminReviewAccess(request)) return unauthorized();
  if (request.headers.get("x-admin-review") !== "1") {
    return NextResponse.json(envelope({ status: "error", message: "Missing review header." }), { status: 403 });
  }

  try {
    const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        envelope({ status: "error", message: "candidateId (uuid) and action (verify|reject) are required." }),
        { status: 400 },
      );
    }
    const { candidateId, action } = parsed.data;
    const result = action === "verify"
      ? await verifyFoodMappingCandidate(candidateId)
      : await rejectFoodMappingCandidate(candidateId);
    return NextResponse.json(
      envelope({
        status: "ok",
        message: action === "verify" ? "Candidate verified and mapping activated." : "Candidate rejected; history preserved.",
        data: result,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Candidate not found") {
      return NextResponse.json(envelope({ status: "error", message: "Candidate not found." }), { status: 404 });
    }
    if (error instanceof Error && error.message === "A rejected candidate cannot be verified") {
      return NextResponse.json(envelope({ status: "error", message: "A rejected candidate cannot be verified." }), { status: 409 });
    }
    return handleApiError(error);
  }
}
