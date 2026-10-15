import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stage-5 pipeline integration: real candidate assembly + real nutrition calculation
 * (provenance chain) with only the network (USDA) and the AI selector mocked.
 */

const db = vi.hoisted(() => ({
  mealLogEntry: { update: vi.fn() },
  foodItem: { create: vi.fn() },
  dietaryRestriction: { findMany: vi.fn() },
  foodVocabulary: { findUnique: vi.fn(), update: vi.fn() },
  foodMappingCandidate: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const selectorMock = vi.hoisted(() => ({ selectMatches: vi.fn() }));
vi.mock("@/lib/services/nutrition/ai-match-selector", () => ({
  StubUsdaMatchSelector: class { selectMatches = selectorMock.selectMatches; },
  OpenAiUsdaMatchSelector: class { selectMatches = selectorMock.selectMatches; },
}));

import { runProcessScan, type ProcessScanStep } from "@/lib/jobs/process-scan";

const step: ProcessScanStep = {
  run: async <T,>(_name: string, fn: () => Promise<T> | T): Promise<T> => fn(),
};

const event = { mealLogEntryId: "m1", photoUrl: "single-food", userId: "u1" };

const appleNutrients = [
  { nutrient: { id: 1008, unitName: "kcal" }, amount: 52 },
  { nutrient: { id: 1003, unitName: "g" }, amount: 0.3 },
  { nutrient: { id: 1005, unitName: "g" }, amount: 14 },
  { nutrient: { id: 1004, unitName: "g" }, amount: 0.2 },
];
// Search responses carry nutrients in the flat search shape.
const appleSearchNutrients = appleNutrients.map((n) => ({
  nutrientId: n.nutrient.id,
  unitName: n.nutrient.unitName,
  value: n.amount,
}));

const originalFetch = globalThis.fetch;

function usdaFetch(opts: { detailStatus: 200 | 404 }) {
  return vi.fn().mockImplementation(async (url: string, init?: { body?: string }) => {
    if (url.includes("/foods/search")) {
      const { query } = JSON.parse(init?.body ?? "{}") as { query?: string };
      const foods = query === "apple"
        ? [
            { fdcId: 111, description: "Apple, raw", dataType: "SR Legacy", foodNutrients: appleSearchNutrients },
            { fdcId: 112, description: "Apple, dried, sulfured", dataType: "SR Legacy", foodNutrients: appleSearchNutrients },
          ]
        : [];
      return new Response(JSON.stringify({ foods }), { status: 200 });
    }
    if (/\/food\/\d+/.test(url)) {
      return opts.detailStatus === 200
        ? new Response(JSON.stringify({ dataType: "SR Legacy", foodNutrients: appleNutrients }), { status: 200 })
        : new Response("not found", { status: 404 });
    }
    return new Response("unexpected", { status: 500 });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("USDA_FDC_API_KEY", "test-key");
  db.mealLogEntry.update.mockResolvedValue({});
  db.foodItem.create.mockResolvedValue({});
  db.dietaryRestriction.findMany.mockResolvedValue([]);
  db.foodVocabulary.findUnique.mockResolvedValue(null);
  db.foodVocabulary.update.mockResolvedValue({});
  db.foodMappingCandidate.findMany.mockResolvedValue([]);
  db.foodMappingCandidate.findFirst.mockResolvedValue(null);
  db.foodMappingCandidate.create.mockResolvedValue({});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("scan pipeline with AI USDA matching (real nutrition chain)", () => {
  it("applies a valid AI selection: detail lookup serves nutrition, ai_selected persisted", async () => {
    globalThis.fetch = usdaFetch({ detailStatus: 200 });
    selectorMock.selectMatches.mockResolvedValue({
      status: "completed",
      selections: [{ ingredientName: "apple", fdcId: 111, rationale: "fresh whole apple visible" }],
    });

    const result = await runProcessScan(event, step);

    expect(result).toEqual({ status: "identified" });
    const data = db.foodItem.create.mock.calls[0][0].data;
    expect(data.usdaFdcId).toBe(111);
    expect(data.usdaMatchSource).toBe("ai_selected");
    expect(data.usdaDescription).toBe("Apple, raw");
    // Stub fixture portion: exact 182g; USDA reference 52 kcal per 100g.
    expect(data.calories).toBeCloseTo(94.64);
    expect(data.uncertaintyReason).toContain("USDA reference values");
    // Both meaningfully distinct candidates are stored for later correction.
    expect(data.usdaCandidates.map((c: { fdcId: number }) => c.fdcId)).toEqual([111, 112]);
  });

  it("drops the AI selection when its USDA detail lookup fails, serving name_search instead", async () => {
    globalThis.fetch = usdaFetch({ detailStatus: 404 });
    selectorMock.selectMatches.mockResolvedValue({
      status: "completed",
      selections: [{ ingredientName: "apple", fdcId: 111, rationale: "fresh apple" }],
    });

    const result = await runProcessScan(event, step);

    expect(result).toEqual({ status: "identified" });
    const data = db.foodItem.create.mock.calls[0][0].data;
    // The strict name search matched "Apple, raw" from the search response nutrients.
    expect(data.usdaMatchSource).toBe("name_search");
    expect(data.usdaFdcId).toBe(111);
    expect(data.calories).toBeCloseTo(94.64);
  });

  it("abstention keeps the approximate fallback and still stores candidates", async () => {
    // No apple-matching search results, so the name search also finds nothing.
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/foods/search")) {
        return new Response(JSON.stringify({ foods: [
          { fdcId: 900, description: "Banana, raw", dataType: "SR Legacy" },
        ] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    selectorMock.selectMatches.mockResolvedValue({ status: "completed", selections: [] });

    const result = await runProcessScan(event, step);

    expect(result).toEqual({ status: "identified" });
    const data = db.foodItem.create.mock.calls[0][0].data;
    expect(data.usdaFdcId).toBeNull();
    expect(data.usdaMatchSource).toBeNull();
    // Generic reference tier for "apple" (52 kcal per 100g * 182g portion).
    expect(data.calories).toBeCloseTo(94.64);
    expect(data.uncertaintyReason).toContain("Generic");
    // "Banana, raw" is not reviewable for "apple", so no candidates are stored.
    expect(data.usdaCandidates).toEqual([]);
  });
});
