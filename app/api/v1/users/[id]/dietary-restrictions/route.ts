import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { envelope } from "@/lib/api/envelope";
import { handleApiError } from "@/lib/api/error-handler";
import { putDietaryRestrictionsSchema } from "@/lib/api/schemas";

/** GET/PUT /api/v1/users/{id}/dietary-restrictions — manages saved restrictions (FR-016). */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const restrictions = await prisma.dietaryRestriction.findMany({ where: { userId: params.id } });
    // An empty list is valid and MUST NOT suppress allergen labels on scan results (FR-015 applies regardless).
    return NextResponse.json(envelope({ status: "ok", message: "Restrictions loaded.", data: { restrictions } }));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = putDietaryRestrictionsSchema.parse(await request.json());

    await prisma.$transaction([
      prisma.dietaryRestriction.deleteMany({ where: { userId: params.id } }),
      // Duplicates for the same user/type are rejected by construction: each type appears at most once per user.
      prisma.dietaryRestriction.createMany({
        data: Array.from(new Set(body.restrictions)).map((type) => ({ userId: params.id, type })),
      }),
    ]);

    const restrictions = await prisma.dietaryRestriction.findMany({ where: { userId: params.id } });
    return NextResponse.json(envelope({ status: "ok", message: "Restrictions updated.", data: { restrictions } }));
  } catch (error) {
    return handleApiError(error);
  }
}
