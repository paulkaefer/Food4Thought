import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  vocabulary: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { foodVocabulary: db.vocabulary } }));

import { MAX_FOOD_MAPPING_CANDIDATES } from "@/lib/services/nutrition/food-vocabulary";
import { assembleMealUsdaCandidates } from "@/lib/services/nutrition/meal-candidates";

const originalFetch = globalThis.fetch;

function usdaSearchResponse(foods: Array<{ fdcId: number; description: string; dataType?: string }>) {
  return new Response(
    JSON.stringify({ foods: foods.map((food) => ({ dataType: "SR Legacy", ...food })) }),
    { status: 200 },
  );
}

/** Answers each USDA search with foods matching the requested query. */
function fetchByQuery(foodsByQuery: Record<string, Array<{ fdcId: number; description: string }>>) {
  return vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
    const { query } = JSON.parse(init.body) as { query: string };
    return usdaSearchResponse(foodsByQuery[query] ?? []);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.vocabulary.findUnique.mockResolvedValue(null);
  db.vocabulary.update.mockResolvedValue({});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("assembleMealUsdaCandidates", () => {
  it("short-circuits ingredients with a verified mapping: no USDA search, empty candidates", async () => {
    db.vocabulary.findUnique.mockResolvedValue({
      normalizedDescription: "butter",
      verificationStatus: "verified",
      usdaFdcId: 1234,
      usdaDescription: "Butter, salted",
    });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const [set] = await assembleMealUsdaCandidates(["butter"], { apiKey: "test-key" });

    expect(set.verified).toEqual({ fdcId: 1234, description: "Butter, salted" });
    expect(set.candidates).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("collapses grade variants (choice/select) and keeps fat retention distinct", async () => {
    globalThis.fetch = fetchByQuery({
      "grilled steak": [
        { fdcId: 171786, description: 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, select, cooked, grilled' },
        { fdcId: 171785, description: 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled' },
        { fdcId: 168731, description: 'Beef, shoulder steak, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled' },
        { fdcId: 168732, description: 'Beef, shoulder steak, boneless, separable lean only, trimmed to 0" fat, select, cooked, grilled' },
        { fdcId: 167670, description: "CRACKER BARREL, grilled sirloin steak" },
      ],
    });

    const [set] = await assembleMealUsdaCandidates(["grilled steak"], { apiKey: "test-key" });

    expect(set.verified).toBeNull();
    // Only USDA-returned IDs: lean-only (best), lean-and-fat (best), restaurant sirloin.
    expect(set.candidates.map((candidate) => candidate.fdcId)).toEqual([167670, 168731, 171785]);
  });

  it("caps each ingredient at five meaningfully distinct candidates", async () => {
    globalThis.fetch = fetchByQuery({
      rice: [
        { fdcId: 1, description: "Rice, white, cooked" },
        { fdcId: 2, description: "Rice, brown, cooked" },
        { fdcId: 3, description: "Rice, wild, cooked" },
        { fdcId: 4, description: "Rice, jasmine, cooked" },
        { fdcId: 5, description: "Rice, basmati, cooked" },
        { fdcId: 6, description: "Rice, arborio, cooked" },
      ],
    });

    const [set] = await assembleMealUsdaCandidates(["rice"], { apiKey: "test-key" });

    expect(set.candidates).toHaveLength(MAX_FOOD_MAPPING_CANDIDATES);
    expect(set.candidates.map((candidate) => candidate.fdcId)).toEqual([1, 2, 3, 4, 5]);
  });

  it("enforces a meal-level request budget across ingredients", async () => {
    const fetchMock = fetchByQuery({
      rice: [{ fdcId: 1, description: "Rice, white, cooked" }],
      broccoli: [{ fdcId: 2, description: "Broccoli, cooked" }],
      apple: [{ fdcId: 3, description: "Apple, raw" }],
    });
    globalThis.fetch = fetchMock;

    const sets = await assembleMealUsdaCandidates(["rice", "broccoli", "apple"], {
      apiKey: "test-key",
      maxRequests: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sets[0].candidates.map((c) => c.fdcId)).toEqual([1]);
    expect(sets[1].candidates.map((c) => c.fdcId)).toEqual([2]);
    expect(sets[2].candidates).toEqual([]); // budget exhausted before the third ingredient
  });

  it("enforces a meal-level time budget across ingredients", async () => {
    let clock = 1000;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body) as { query: string };
      clock += 13_000; // each request burns more than the remaining budget
      return usdaSearchResponse(query === "rice" ? [{ fdcId: 1, description: "Rice, white, cooked" }] : []);
    });
    globalThis.fetch = fetchMock;

    const sets = await assembleMealUsdaCandidates(["rice", "broccoli"], {
      apiKey: "test-key",
      now: () => clock,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sets[0].candidates.map((c) => c.fdcId)).toEqual([1]);
    expect(sets[1].candidates).toEqual([]);
  });

  it("assembles duplicate ingredient names once and shares the result", async () => {
    const fetchMock = fetchByQuery({ rice: [{ fdcId: 1, description: "Rice, white, cooked" }] });
    globalThis.fetch = fetchMock;

    const sets = await assembleMealUsdaCandidates(["rice", "Rice "], { apiKey: "test-key" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sets).toHaveLength(2);
    expect(sets[0].candidates.map((c) => c.fdcId)).toEqual([1]);
    expect(sets[1].candidates.map((c) => c.fdcId)).toEqual([1]);
  });

  it("degrades a per-ingredient USDA failure to empty candidates without failing the meal", async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body) as { query: string };
      calls++;
      if (query === "rice") throw new Error("USDA offline");
      return usdaSearchResponse([{ fdcId: 2, description: "Broccoli, cooked" }]);
    });
    globalThis.fetch = fetchMock;

    const sets = await assembleMealUsdaCandidates(["rice", "broccoli"], { apiKey: "test-key" });

    expect(sets[0].candidates).toEqual([]);
    expect(sets[1].candidates.map((c) => c.fdcId)).toEqual([2]);
    expect(calls).toBe(2);
  });

  it("makes no requests without an API key", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const sets = await assembleMealUsdaCandidates(["rice"], { apiKey: "" });

    expect(sets[0].candidates).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
