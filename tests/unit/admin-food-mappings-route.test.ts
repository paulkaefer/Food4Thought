import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  candidate: { findMany: vi.fn() },
  vocabulary: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { foodMappingCandidate: db.candidate, foodVocabulary: db.vocabulary },
}));

const reviewMock = vi.hoisted(() => ({
  verifyFoodMappingCandidate: vi.fn(),
  rejectFoodMappingCandidate: vi.fn(),
}));
vi.mock("@/lib/services/nutrition/food-vocabulary", () => reviewMock);

import { GET, POST } from "@/app/api/v1/admin/food-mappings/route";

function request(opts: { token?: string; header?: boolean; body?: unknown }): NextRequest {
  return {
    cookies: { get: () => (opts.token ? { value: opts.token } : undefined) },
    headers: new Headers(opts.header ? { "x-admin-review": "1" } : {}),
    json: async () => opts.body,
  } as unknown as NextRequest;
}

const candidateRow = {
  id: "c1",
  normalizedDescription: "steak",
  foodDescription: "steak",
  usdaFdcId: 111,
  usdaDescription: "Steak, broiled",
  usdaDataType: "Survey (FNDDS)",
  score: 0.5,
  status: "proposed",
  createdAt: new Date("2026-10-11T00:00:00Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_REVIEW_TOKEN", "test-secret");
  db.candidate.findMany.mockResolvedValue([candidateRow]);
  db.vocabulary.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/v1/admin/food-mappings", () => {
  it("returns 503 when admin review is not configured", async () => {
    vi.stubEnv("ADMIN_REVIEW_TOKEN", "");
    const response = await GET(request({ token: "test-secret" }));
    expect(response.status).toBe(503);
  });

  it("returns 401 without a valid admin session", async () => {
    expect((await GET(request({}))).status).toBe(401);
    expect((await GET(request({ token: "wrong" }))).status).toBe(401);
  });

  it("returns grouped candidates and verified mappings for authorized reviewers", async () => {
    const response = await GET(request({ token: "test-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.data.candidates[0]).toMatchObject({
      normalizedDescription: "steak",
      foodDescription: "steak",
      usdaFdcId: 111,
      status: "proposed",
    });
    expect(body.data.verified).toEqual([]);
  });
});

describe("POST /api/v1/admin/food-mappings", () => {
  const validBody = { candidateId: "5f4dcc3b-5aa7-4bf0-8c1f-2f3b3f7d1111", action: "verify" };

  it("rejects unauthenticated requests", async () => {
    expect((await POST(request({ header: true, body: validBody }))).status).toBe(401);
  });

  it("requires the custom review header on mutations", async () => {
    expect((await POST(request({ token: "test-secret", body: validBody }))).status).toBe(403);
  });

  it("validates the review body", async () => {
    expect((await POST(request({ token: "test-secret", header: true, body: { candidateId: "nope" } }))).status).toBe(400);
  });

  it("verifies a candidate through the transactional service", async () => {
    reviewMock.verifyFoodMappingCandidate.mockResolvedValue({ normalizedDescription: "steak", usdaFdcId: 111 });

    const response = await POST(request({ token: "test-secret", header: true, body: validBody }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain("verified");
    expect(reviewMock.verifyFoodMappingCandidate).toHaveBeenCalledWith(validBody.candidateId);
    expect(reviewMock.rejectFoodMappingCandidate).not.toHaveBeenCalled();
  });

  it("rejects a candidate, preserving history", async () => {
    reviewMock.rejectFoodMappingCandidate.mockResolvedValue({ normalizedDescription: "steak", usdaFdcId: 111 });

    const response = await POST(request({ token: "test-secret", header: true, body: { ...validBody, action: "reject" } }));

    expect(response.status).toBe(200);
    expect(reviewMock.rejectFoodMappingCandidate).toHaveBeenCalledWith(validBody.candidateId);
  });

  it("maps service errors to actionable statuses", async () => {
    reviewMock.verifyFoodMappingCandidate.mockRejectedValue(new Error("Candidate not found"));
    expect((await POST(request({ token: "test-secret", header: true, body: validBody }))).status).toBe(404);

    reviewMock.verifyFoodMappingCandidate.mockRejectedValue(new Error("A rejected candidate cannot be verified"));
    expect((await POST(request({ token: "test-secret", header: true, body: validBody }))).status).toBe(409);
  });
});
