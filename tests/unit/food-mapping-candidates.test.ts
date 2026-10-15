import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  candidate: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  vocabulary: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { foodMappingCandidate: db.candidate, foodVocabulary: db.vocabulary },
}));

const searchMock = vi.hoisted(() => ({ findUsdaMatchCandidates: vi.fn() }));
vi.mock("@/lib/services/nutrition/usda-match-candidates", () => ({
  findUsdaMatchCandidates: searchMock.findUsdaMatchCandidates,
}));

import {
  countProposedCandidates,
  MAX_FOOD_MAPPING_CANDIDATES,
  proposeFoodMappingCandidates,
} from "@/lib/services/nutrition/food-vocabulary";
import { discoverFoodVocabulary } from "@/lib/services/nutrition/discover-food-vocabulary";

function input(usdaFdcId: number, usdaDescription = "Steak, broiled") {
  return { foodDescription: "steak", usdaFdcId, usdaDescription, usdaDataType: "Survey (FNDDS)", score: 0.8 };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("proposeFoodMappingCandidates", () => {
  it("stores at most five candidates per food name, all as proposed with scores", async () => {
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.create.mockResolvedValue({});
    const inputs = Array.from({ length: 7 }, (_, i) => ({
      foodDescription: "steak",
      usdaFdcId: 100 + i,
      usdaDescription: `Steak candidate ${i}`,
      usdaDataType: "Survey (FNDDS)",
      score: 1 - i * 0.1,
    }));

    const result = await proposeFoodMappingCandidates("Steak", inputs);

    expect(db.candidate.create).toHaveBeenCalledTimes(MAX_FOOD_MAPPING_CANDIDATES);
    expect(result).toEqual({ proposed: MAX_FOOD_MAPPING_CANDIDATES, skipped: 0 });
    expect(db.candidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        normalizedDescription: "steak",
        usdaFdcId: 100,
        status: "proposed",
        score: 1,
      }),
    });
  });

  it("ignores duplicate candidates without overwriting the existing row", async () => {
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.create.mockRejectedValue({ code: "P2002" });

    const result = await proposeFoodMappingCandidates("steak", [input(123)]);

    expect(result).toEqual({ proposed: 0, skipped: 1 });
  });

  it("never re-proposes a candidate already rejected for that food name", async () => {
    db.candidate.findMany.mockImplementation((args: { where?: { status?: unknown } }) =>
      Promise.resolve(args?.where?.status === "rejected" ? [{ usdaFdcId: 2709752 }] : []));
    db.candidate.create.mockResolvedValue({});

    const result = await proposeFoodMappingCandidates("steak", [
      input(2709752, "Steak sauce"),
      input(169756, "Beef, steak, cooked"),
    ]);

    expect(result).toEqual({ proposed: 1, skipped: 1 });
    expect(db.candidate.create).toHaveBeenCalledTimes(1);
    expect(db.candidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ usdaFdcId: 169756 }),
    });
    // Rejection history is queried per food name, preserving the audit trail.
    expect(db.candidate.findMany).toHaveBeenCalledWith({
      where: { normalizedDescription: "steak", status: "rejected" },
      select: { usdaFdcId: true },
    });
  });

  it("stores only one record per logical choice within a single batch", async () => {
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.create.mockResolvedValue({});

    const result = await proposeFoodMappingCandidates("grilled steak", [
      input(171786, 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, select, cooked, grilled'),
      input(171785, 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled'),
      input(168731, 'Beef, shoulder steak, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled'),
      input(167670, "CRACKER BARREL, grilled sirloin steak"),
    ]);

    // The select/choice pair collapses; lean-only and the restaurant sirloin stay distinct.
    expect(result).toEqual({ proposed: 3, skipped: 1 });
    expect(db.candidate.create).toHaveBeenCalledTimes(3);
    const storedIds = db.candidate.create.mock.calls.map((call) => call[0].data.usdaFdcId);
    expect(storedIds).toEqual([171786, 168731, 167670]);
  });

  it("skips a candidate equivalent to an already-stored active (proposed/verified) row", async () => {
    db.candidate.findMany.mockImplementation((args: { where?: { status?: unknown } }) =>
      Promise.resolve(args?.where?.status === "rejected"
        ? []
        : [{ usdaDescription: 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, select, cooked, grilled' }]));

    const result = await proposeFoodMappingCandidates("grilled steak", [
      input(171785, 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled'),
      input(167670, "CRACKER BARREL, grilled sirloin steak"),
    ]);

    expect(result).toEqual({ proposed: 1, skipped: 1 });
    expect(db.candidate.create).toHaveBeenCalledTimes(1);
    expect(db.candidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ usdaFdcId: 167670 }),
    });
    expect(db.candidate.findMany).toHaveBeenCalledWith({
      where: { normalizedDescription: "grilled steak", status: { in: ["proposed", "verified"] } },
      select: { usdaDescription: true },
    });
  });

  it("a rejected record blocks only its exact FDC ID, not a different equivalent record", async () => {
    db.candidate.findMany.mockImplementation((args: { where?: { status?: unknown } }) =>
      Promise.resolve(args?.where?.status === "rejected" ? [{ usdaFdcId: 168731 }] : []));
    db.candidate.create.mockResolvedValue({});

    const result = await proposeFoodMappingCandidates("grilled steak", [
      input(168731, 'Beef, shoulder steak, separable lean only, trimmed to 0" fat, choice, cooked, grilled'),
      input(168732, 'Beef, shoulder steak, separable lean only, trimmed to 0" fat, select, cooked, grilled'),
    ]);

    expect(result).toEqual({ proposed: 1, skipped: 1 });
    expect(db.candidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ usdaFdcId: 168732 }),
    });
  });

  it("stores up to five meaningfully distinct choices, looking past skipped duplicates", async () => {
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.create.mockResolvedValue({});
    const distinct = Array.from({ length: MAX_FOOD_MAPPING_CANDIDATES }, (_, i) =>
      input(100 + i, `Steak candidate ${i}`));

    const result = await proposeFoodMappingCandidates("steak", [
      ...distinct.slice(0, 2),
      input(200, "STEAK candidate 0"), // equivalent to the first, different FDC ID
      ...distinct.slice(2),
    ]);

    expect(result).toEqual({ proposed: MAX_FOOD_MAPPING_CANDIDATES, skipped: 1 });
    expect(db.candidate.create).toHaveBeenCalledTimes(MAX_FOOD_MAPPING_CANDIDATES);
  });

  it("rejects invalid USDA IDs instead of storing them", async () => {
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.create.mockResolvedValue({});

    const result = await proposeFoodMappingCandidates("steak", [
      input(0),
      input(-3),
      input(1.5),
      input(42),
    ]);

    expect(result).toEqual({ proposed: 1, skipped: 3 });
  });

  it("propagates unexpected database errors", async () => {
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.create.mockRejectedValue(new Error("Database unavailable"));

    await expect(proposeFoodMappingCandidates("steak", [input(123)])).rejects.toThrow("Database unavailable");
  });
});

describe("countProposedCandidates", () => {
  it("counts meaningfully distinct choices, not raw rows", async () => {
    db.candidate.findMany.mockResolvedValue([
      { usdaDescription: 'Beef, shoulder steak, separable lean and fat, trimmed to 0" fat, select, cooked, grilled' },
      { usdaDescription: 'Beef, shoulder steak, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled' },
      { usdaDescription: "CRACKER BARREL, grilled sirloin steak" },
    ]);

    expect(await countProposedCandidates("grilled steak")).toBe(2);
    expect(db.candidate.findMany).toHaveBeenCalledWith({
      where: { normalizedDescription: "grilled steak", status: "proposed" },
      select: { usdaDescription: true },
    });
  });
});

describe("discoverFoodVocabulary candidate storage", () => {
  it("stores the ranked candidates without verifying anything", async () => {
    db.vocabulary.findUnique.mockResolvedValue(null);
    db.candidate.findFirst.mockResolvedValue(null);
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.create.mockResolvedValue({});
    searchMock.findUsdaMatchCandidates.mockResolvedValue([
      { fdcId: 1, description: "Steak, broiled", dataType: "Survey (FNDDS)", score: 0.8 },
      { fdcId: 2, description: "Beef, steak, cooked", dataType: "SR Legacy", score: 0.7 },
    ]);

    const result = await discoverFoodVocabulary("steak");

    expect(result).toMatchObject({ status: "proposed", fdcId: 1 });
    expect(db.candidate.create).toHaveBeenCalledTimes(2);
    for (const call of db.candidate.create.mock.calls) {
      expect(call[0].data.status).toBe("proposed");
    }
    expect(db.vocabulary.create).not.toHaveBeenCalled();
  });

  it("returns already_verified without searching or storing candidates", async () => {
    db.vocabulary.findUnique.mockResolvedValue({
      id: "v1",
      normalizedDescription: "steak",
      foodDescription: "steak",
      usdaFdcId: 169756,
      usdaDescription: "Beef, steak, cooked",
      usdaDataType: "SR Legacy",
      verificationStatus: "verified",
    });
    db.vocabulary.update.mockResolvedValue({});

    const result = await discoverFoodVocabulary("steak");

    expect(result).toEqual({ status: "already_verified", fdcId: 169756 });
    expect(searchMock.findUsdaMatchCandidates).not.toHaveBeenCalled();
    expect(db.candidate.create).not.toHaveBeenCalled();
  });

  it("returns no_candidate and stores nothing when search finds nothing", async () => {
    db.vocabulary.findUnique.mockResolvedValue(null);
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.findFirst.mockResolvedValue(null);
    searchMock.findUsdaMatchCandidates.mockResolvedValue([]);

    expect(await discoverFoodVocabulary("mystery loaf")).toEqual({ status: "no_candidate" });
    expect(db.candidate.create).not.toHaveBeenCalled();
  });
});
