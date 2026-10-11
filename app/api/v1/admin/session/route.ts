import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { envelope } from "@/lib/api/envelope";
import { ADMIN_REVIEW_COOKIE, isAdminReviewEnabled, isValidAdminToken } from "@/lib/api/admin-auth";

const bodySchema = z.object({ token: z.string().min(1) });

/**
 * POST /api/v1/admin/session — exchange the shared admin token for an HttpOnly,
 * SameSite=Strict session cookie. Disabled (503) when ADMIN_REVIEW_TOKEN is unset.
 */
export async function POST(request: NextRequest) {
  if (!isAdminReviewEnabled()) {
    return NextResponse.json(
      envelope({ status: "error", message: "Admin review is not configured on this deployment." }),
      { status: 503 },
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isValidAdminToken(parsed.data.token)) {
    return NextResponse.json(envelope({ status: "error", message: "Invalid admin token." }), { status: 401 });
  }
  const response = NextResponse.json(envelope({ status: "ok", message: "Signed in." }));
  response.cookies.set(ADMIN_REVIEW_COOKIE, parsed.data.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8-hour review sessions
  });
  return response;
}

/** DELETE /api/v1/admin/session — clear the review session cookie. */
export async function DELETE() {
  const response = NextResponse.json(envelope({ status: "ok", message: "Signed out." }));
  response.cookies.set(ADMIN_REVIEW_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
