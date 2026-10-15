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

import { discoverFoodVocabulary, shouldDiscoverVocabulary } from "@/lib/services/nutrition/discover-food-vocabulary";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("shouldDiscoverVocabulary trigger", () => {
  it("triggers when nutrition is unavailable (both message variants)", () => {
    expect(shouldDiscoverVocabulary(
      "Nutrition unavailable: no verified USDA match. Zero values are placeholders, not measured nutrition; meal totals may be incomplete.",
    )).toBe(true);
    expect(shouldDiscoverVocabulary(
      "Hidden or unclear ingredients; nutrition unavailable without a verified USDA match. Zero values are placeholders, not measured nutrition.",
    )).toBe(true);
  });

  it("triggers on generic and broad approximate tiers, including composed reasons", () => {
    expect(shouldDiscoverVocabulary(
      "Generic food reference estimate; variety, ingredients and preparation may differ.",
    )).toBe(true);
    expect(shouldDiscoverVocabulary(
      "Generic food reference estimate; variety, ingredients and preparation may differ. Portion size is approximate — no scale reference was visible.",
    )).toBe(true);
    expect(shouldDiscoverVocabulary(
      "Broad cream-based sauce estimate; actual ingredients and preparation may differ substantially.",
    )).toBe(true);
  });

  it("does not trigger for USDA-backed results, portion-only warnings, or missing reasons", () => {
    expect(shouldDiscoverVocabulary("USDA reference values; preparation and variety may differ.")).toBe(false);
    expect(shouldDiscoverVocabulary(
      "USDA reference values; preparation and variety may differ. Portion size is approximate — no scale reference was visible.",
    )).toBe(false);
    expect(shouldDiscoverVocabulary("Portion size is approximate — no scale reference was visible.")).toBe(false);
    expect(shouldDiscoverVocabulary(null)).toBe(false);
  });
});

describe("candidate-count and cooldown policy", () => {
  it("skips the search when the review set is full (5 distinct pending choices)", async () => {
    db.vocabulary.findUnique.mockResolvedValue(null);
    db.candidate.findMany.mockResolvedValue([
      { usdaDescription: "Beef, shoulder steak, lean and fat, select, cooked, grilled" },
      { usdaDescription: "Beef, shoulder steak, lean only, select, cooked, grilled" },
      { usdaDescription: "Beef, flank steak, cooked, grilled" },
      { usdaDescription: "CRACKER BARREL, grilled sirloin steak" },
      { usdaDescription: "Beef, chuck eye steak, cooked, grilled" },
    ]);

    const result = await discoverFoodVocabulary("steak");

    expect(result).toEqual({ status: "candidates_pending", pending: 5 });
    expect(searchMock.findUsdaMatchCandidates).not.toHaveBeenCalled();
    expect(db.candidate.create).not.toHaveBeenCalled();
  });

  it("duplicate rows of one logical choice do not count as a full review set", async () => {
    db.vocabulary.findUnique.mockResolvedValue(null);
    db.candidate.findMany.mockImplementation((args: { where?: { status?: unknown } }) =>
      Promise.resolve(args?.where?.status === "rejected"
        ? []
        : [
            { usdaDescription: "Beef, shoulder steak, lean and fat, select, cooked, grilled" },
            { usdaDescription: "Beef, shoulder steak, lean and fat, choice, cooked, grilled" },
          ]));
    db.candidate.findFirst.mockResolvedValue({ createdAt: new Date("2026-10-09T00:00:00Z") }); // 48h ago
    db.candidate.create.mockResolvedValue({});
    searchMock.findUsdaMatchCandidates.mockResolvedValue([
      { fdcId: 9, description: "Beef, flank steak, cooked, grilled", dataType: "SR Legacy", score: 0.5 },
    ]);

    // Five raw rows would have filled the queue; two equivalent ones leave room to top up.
    const result = await discoverFoodVocabulary("skirt steak", Date.parse("2026-10-11T00:00:00Z"));

    expect(result).toMatchObject({ status: "proposed", fdcId: 9 });
    expect(searchMock.findUsdaMatchCandidates).toHaveBeenCalledTimes(1);
  });

  it("one pending candidate does not permanently suppress discovery (top-up after cooldown)", async () => {
    db.vocabulary.findUnique.mockResolvedValue(null);
    db.candidate.findMany.mockImplementation((args: { where?: { status?: unknown } }) =>
      Promise.resolve(args?.where?.status === "rejected" ? [] : [{ usdaDescription: "Beef, rib eye, cooked" }]));
    db.candidate.findFirst.mockResolvedValue({ createdAt: new Date("2026-10-09T00:00:00Z") }); // 48h ago
    db.candidate.create.mockResolvedValue({});
    searchMock.findUsdaMatchCandidates.mockResolvedValue([
      { fdcId: 9, description: "Beef, ribeye steak, cooked, grilled", dataType: "Survey (FNDDS)", score: 0.5 },
    ]);

    const result = await discoverFoodVocabulary("ribeye", Date.parse("2026-10-11T00:00:00Z"));

    expect(result).toMatchObject({ status: "proposed", fdcId: 9 });
    expect(searchMock.findUsdaMatchCandidates).toHaveBeenCalledTimes(1);
  });

  it("a partial pending set inside the cooldown window skips the search", async () => {
    db.vocabulary.findUnique.mockResolvedValue(null);
    db.candidate.findMany.mockResolvedValue([
      { usdaDescription: "Beef, sirloin steak, cooked, grilled" },
      { usdaDescription: "Beef, sirloin tip, cooked, roasted" },
    ]);
    db.candidate.findFirst.mockResolvedValue({ createdAt: new Date("2026-10-10T23:00:00Z") }); // 1h ago

    const result = await discoverFoodVocabulary("sirloin", Date.parse("2026-10-11T00:00:00Z"));

    expect(result).toEqual({ status: "skipped_cooldown", pending: 2 });
    expect(searchMock.findUsdaMatchCandidates).not.toHaveBeenCalled();
  });

  it("repeated no-result searches are cooled down in-process", async () => {
    db.vocabulary.findUnique.mockResolvedValue(null);
    db.candidate.findMany.mockResolvedValue([]);
    db.candidate.findFirst.mockResolvedValue(null);
    searchMock.findUsdaMatchCandidates.mockResolvedValue([]);
    const now = Date.parse("2026-10-11T00:00:00Z");

    expect(await discoverFoodVocabulary("mystery loaf", now)).toEqual({ status: "no_candidate" });
    expect(await discoverFoodVocabulary("mystery loaf", now + 60_000)).toEqual({ status: "skipped_cooldown", pending: 0 });
    expect(searchMock.findUsdaMatchCandidates).toHaveBeenCalledTimes(1);
  });
});
