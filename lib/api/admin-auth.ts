import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_REVIEW_COOKIE = "f4t_admin_review";

/**
 * Admin review is enabled only when a shared admin token is configured.
 * Default (unset) state is disabled — no publicly accessible review endpoints.
 */
export function isAdminReviewEnabled(): boolean {
  return Boolean(process.env.ADMIN_REVIEW_TOKEN);
}

/** Timing-safe comparison: hashes first so token length/content never leak through timing. */
export function isValidAdminToken(candidate: string | undefined | null): boolean {
  const expected = process.env.ADMIN_REVIEW_TOKEN;
  if (!expected || !candidate) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Cookie-based gate for admin review routes. */
export function hasAdminReviewAccess(request: NextRequest): boolean {
  return isAdminReviewEnabled() && isValidAdminToken(request.cookies.get(ADMIN_REVIEW_COOKIE)?.value);
}
