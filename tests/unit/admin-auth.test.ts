import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { ADMIN_REVIEW_COOKIE, hasAdminReviewAccess, isAdminReviewEnabled, isValidAdminToken } from "@/lib/api/admin-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

function requestWithCookie(value?: string): NextRequest {
  return {
    cookies: { get: (name: string) => (name === ADMIN_REVIEW_COOKIE && value ? { value } : undefined) },
  } as unknown as NextRequest;
}

describe("admin review authentication", () => {
  it("is disabled by default when ADMIN_REVIEW_TOKEN is unset", () => {
    vi.stubEnv("ADMIN_REVIEW_TOKEN", "");
    expect(isAdminReviewEnabled()).toBe(false);
    expect(isValidAdminToken("anything")).toBe(false);
    expect(hasAdminReviewAccess(requestWithCookie("anything"))).toBe(false);
  });

  it("accepts only the configured token, compared timing-safely", () => {
    vi.stubEnv("ADMIN_REVIEW_TOKEN", "test-secret");
    expect(isAdminReviewEnabled()).toBe(true);
    expect(isValidAdminToken("test-secret")).toBe(true);
    expect(isValidAdminToken("wrong")).toBe(false);
    expect(isValidAdminToken("test-secret-but-longer")).toBe(false);
    expect(isValidAdminToken(undefined)).toBe(false);
  });

  it("grants access only with the session cookie present and matching", () => {
    vi.stubEnv("ADMIN_REVIEW_TOKEN", "test-secret");
    expect(hasAdminReviewAccess(requestWithCookie("test-secret"))).toBe(true);
    expect(hasAdminReviewAccess(requestWithCookie("wrong"))).toBe(false);
    expect(hasAdminReviewAccess(requestWithCookie(undefined))).toBe(false);
  });
});
