import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  foodMappingCandidate: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  foodVocabulary: { upsert: vi.fn(), updateMany: vi.fn() },
}));

const db = vi.hoisted(() => ({
  foodVocabulary: { findUnique: vi.fn(), update: vi.fn() },
  foodMappingCandidate: { findMany: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
    foodVocabulary: db.foodVocabulary,
    foodMappingCandidate: db.foodMappingCandidate,
  },
}));

import {
  findVerifiedFoodMapping,
  rejectFoodMappingCandidate,
  verifyFoodMappingCandidate,
} from "@/lib/services/nutrition/food-vocabulary";

const proposedCandidate = {
  id: "c1",
  normalizedDescription: "steak",
  foodDescription: "steak",
  usdaFdcId: 111,
  usdaDescription: "Steak, broiled",
  usdaDataType: "Survey (FNDDS)",
  status: "proposed",
};

beforeEach(() => {
  vi.resetAllMocks();
  tx.foodMappingCandidate.findUnique.mockResolvedValue(proposedCandidate);
  tx.foodVocabulary.upsert.mockResolvedValue({});
  tx.foodMappingCandidate.updateMany.mockResolvedValue({ count: 0 });
  tx.foodMappingCandidate.update.mockResolvedValue({});
});

describe("verifyFoodMappingCandidate (human verification, atomic)", () => {
  it("upserts the authoritative mapping as verified/human, demotes other verified candidates, marks the candidate verified", async () => {
    const result = await verifyFoodMappingCandidate("c1");

    expect(tx.foodVocabulary.upsert).toHaveBeenCalledWith({
      where: { normalizedDescription: "steak" },
      create: expect.objectContaining({
        normalizedDescription: "steak",
        usdaFdcId: 111,
        verificationStatus: "verified",
        verifiedBy: "human",
      }),
      update: expect.objectContaining({
        usdaFdcId: 111,
        verificationStatus: "verified",
        verifiedBy: "human",
      }),
    });
    expect(tx.foodMappingCandidate.updateMany).toHaveBeenCalledWith({
      where: { normalizedDescription: "steak", status: "verified", id: { not: "c1" } },
      data: expect.objectContaining({ status: "proposed" }),
    });
    expect(tx.foodMappingCandidate.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ status: "verified" }),
    });
    expect(result).toEqual({ normalizedDescription: "steak", usdaFdcId: 111 });
  });

  it("replaces an existing verified mapping via the upsert update branch", async () => {
    // The unique FoodVocabulary row may already point at an older fdcId; verification must
    // atomically move it to the newly verified candidate's record.
    await verifyFoodMappingCandidate("c1");

    const upsertArgs = tx.foodVocabulary.upsert.mock.calls[0][0];
    expect(upsertArgs.update.usdaFdcId).toBe(111);
    expect(upsertArgs.update.usdaDescription).toBe("Steak, broiled");
    expect(upsertArgs.update.verifiedBy).toBe("human");
  });

  it("refuses to verify a rejected candidate", async () => {
    tx.foodMappingCandidate.findUnique.mockResolvedValue({ ...proposedCandidate, status: "rejected" });

    await expect(verifyFoodMappingCandidate("c1")).rejects.toThrow("rejected");
    expect(tx.foodVocabulary.upsert).not.toHaveBeenCalled();
  });

  it("refuses to verify an unknown candidate", async () => {
    tx.foodMappingCandidate.findUnique.mockResolvedValue(null);

    await expect(verifyFoodMappingCandidate("missing")).rejects.toThrow("Candidate not found");
    expect(tx.foodVocabulary.upsert).not.toHaveBeenCalled();
  });
});

describe("rejectFoodMappingCandidate (history preserved, re-proposal blocked)", () => {
  it("marks the candidate rejected without touching the authoritative table for proposed candidates", async () => {
    const result = await rejectFoodMappingCandidate("c1");

    expect(tx.foodMappingCandidate.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ status: "rejected" }),
    });
    expect(tx.foodVocabulary.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ normalizedDescription: "steak", usdaFdcId: 111 });
  });

  it("revokes the authoritative mapping when rejecting the live verified candidate", async () => {
    tx.foodMappingCandidate.findUnique.mockResolvedValue({ ...proposedCandidate, status: "verified" });

    await rejectFoodMappingCandidate("c1");

    expect(tx.foodVocabulary.updateMany).toHaveBeenCalledWith({
      where: { normalizedDescription: "steak", usdaFdcId: 111, verificationStatus: "verified" },
      data: { verificationStatus: "rejected", verifiedBy: null },
    });
  });

  it("rejected candidates are never re-proposed (rejection history honored)", async () => {
    // proposeFoodMappingCandidates reads rejected IDs via findMany and skips them.
    db.foodMappingCandidate.findMany.mockImplementation((args: { where?: { status?: unknown } }) =>
      Promise.resolve(args?.where?.status === "rejected" ? [{ usdaFdcId: 111 }] : []));
    db.foodMappingCandidate.create.mockResolvedValue({});

    const { proposeFoodMappingCandidates } = await import("@/lib/services/nutrition/food-vocabulary");
    const result = await proposeFoodMappingCandidates("steak", [
      { foodDescription: "steak", usdaFdcId: 111, usdaDescription: "Steak, broiled", usdaDataType: "Survey (FNDDS)" },
    ]);

    expect(result).toEqual({ proposed: 0, skipped: 1 });
    expect(db.foodMappingCandidate.create).not.toHaveBeenCalled();
  });
});

describe("verified mapping reuse (USDA-first path)", () => {
  it("findVerifiedFoodMapping returns verified mappings written by human review", async () => {
    db.foodVocabulary.findUnique.mockResolvedValue({
      id: "v1",
      normalizedDescription: "steak",
      foodDescription: "steak",
      usdaFdcId: 111,
      usdaDescription: "Steak, broiled",
      usdaDataType: "Survey (FNDDS)",
      verificationStatus: "verified",
    });
    db.foodVocabulary.update.mockResolvedValue({});

    const mapping = await findVerifiedFoodMapping("steak");

    expect(mapping).toMatchObject({ usdaFdcId: 111, usdaDescription: "Steak, broiled" });
  });
});
