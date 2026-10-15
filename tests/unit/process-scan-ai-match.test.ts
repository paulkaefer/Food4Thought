import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  mealLogEntry: { update: vi.fn() },
  foodItem: { create: vi.fn() },
  dietaryRestriction: { findMany: vi.fn() },
  foodVocabulary: { findUnique: vi.fn(), update: vi.fn() },
  foodMappingCandidate: { findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const assemblyMock = vi.hoisted(() => ({ assembleMealUsdaCandidates: vi.fn() }));
vi.mock("@/lib/services/nutrition/meal-candidates", () => ({
  assembleMealUsdaCandidates: assemblyMock.assembleMealUsdaCandidates,
}));

const selectorMock = vi.hoisted(() => ({ selectMatches: vi.fn() }));
vi.mock("@/lib/services/nutrition/ai-match-selector", () => ({
  StubUsdaMatchSelector: class { selectMatches = selectorMock.selectMatches; },
  OpenAiUsdaMatchSelector: class { selectMatches = selectorMock.selectMatches; },
}));

const nutritionMock = vi.hoisted(() => ({ calculateNutritionWithProvenance: vi.fn() }));
vi.mock("@/lib/services/nutrition/calculate-nutrition", () => ({
  calculateNutritionWithProvenance: nutritionMock.calculateNutritionWithProvenance,
}));

import { runProcessScan, type ProcessScanStep } from "@/lib/jobs/process-scan";

const step: ProcessScanStep = {
  run: async <T,>(_name: string, fn: () => Promise<T> | T): Promise<T> => fn(),
};

const event = { mealLogEntryId: "m1", photoUrl: "single-food", userId: "u1", description: "a snack" };

const APPLE_CANDIDATES = [
  { fdcId: 101, description: "Apple, raw", dataType: "SR Legacy", score: 0.9 },
  { fdcId: 102, description: "Apple, dried, sulfured", dataType: "SR Legacy", score: 0.4 },
];

const usdaEstimate = {
  calories: 94.6,
  proteinG: 0.5,
  carbsG: 25.5,
  fatG: 0.4,
  micronutrients: {},
  isApproximate: true,
  uncertaintyReason: "USDA reference values; preparation and variety may differ.",
};

beforeEach(() => {
  vi.resetAllMocks();
  db.mealLogEntry.update.mockResolvedValue({});
  db.foodItem.create.mockResolvedValue({});
  db.dietaryRestriction.findMany.mockResolvedValue([]);
  db.foodVocabulary.findUnique.mockResolvedValue(null);
  db.foodVocabulary.update.mockResolvedValue({});
  db.foodMappingCandidate.findMany.mockResolvedValue([]);
  db.foodMappingCandidate.findFirst.mockResolvedValue(null);
  assemblyMock.assembleMealUsdaCandidates.mockResolvedValue([
    { ingredientName: "apple", verified: null, candidates: APPLE_CANDIDATES },
  ]);
  selectorMock.selectMatches.mockResolvedValue({ status: "completed", selections: [] });
  nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({ estimate: usdaEstimate, usda: null });
});

describe("process-scan AI match integration (stage 5)", () => {
  it("passes the AI selection as a preselected match and persists ai_selected provenance", async () => {
    selectorMock.selectMatches.mockResolvedValue({
      status: "completed",
      selections: [{ ingredientName: "apple", fdcId: 102, rationale: "looks dried" }],
    });
    nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({
      estimate: usdaEstimate,
      usda: { fdcId: 102, description: "Apple, dried, sulfured", source: "ai_selected" },
    });

    const result = await runProcessScan(event, step);

    expect(result).toEqual({ status: "identified" });
    // ONE batched call for the meal, with the assembled sets (stub vision has no mealContext).
    expect(selectorMock.selectMatches).toHaveBeenCalledTimes(1);
    expect(selectorMock.selectMatches).toHaveBeenCalledWith(
      [{ ingredientName: "apple", verified: null, candidates: APPLE_CANDIDATES }],
      undefined,
      "a snack",
    );
    expect(nutritionMock.calculateNutritionWithProvenance).toHaveBeenCalledWith(
      expect.objectContaining({ name: "apple" }),
      expect.anything(),
      { fdcId: 102, description: "Apple, dried, sulfured", source: "ai_selected" },
    );
    const data = db.foodItem.create.mock.calls[0][0].data;
    expect(data.usdaFdcId).toBe(102);
    expect(data.usdaMatchSource).toBe("ai_selected");
    expect(data.usdaDescription).toBe("Apple, dried, sulfured");
    expect(data.usdaCandidates).toEqual(APPLE_CANDIDATES);
    expect(data).not.toHaveProperty("rationale"); // rationales are diagnostics only
  });

  it("abstention leaves nutrition on the existing path with no USDA record persisted", async () => {
    selectorMock.selectMatches.mockResolvedValue({
      status: "completed",
      selections: [{ ingredientName: "apple", fdcId: null, rationale: "cannot distinguish" }],
    });

    await runProcessScan(event, step);

    expect(nutritionMock.calculateNutritionWithProvenance).toHaveBeenCalledWith(
      expect.objectContaining({ name: "apple" }),
      expect.anything(),
      undefined,
    );
    const data = db.foodItem.create.mock.calls[0][0].data;
    expect(data.usdaFdcId).toBeNull();
    expect(data.usdaMatchSource).toBeNull();
    expect(data.usdaCandidates).toEqual(APPLE_CANDIDATES); // candidates still offered for correction
  });

  it("persists name_search provenance when the selected record's detail lookup failed", async () => {
    selectorMock.selectMatches.mockResolvedValue({
      status: "completed",
      selections: [{ ingredientName: "apple", fdcId: 102, rationale: "maybe dried" }],
    });
    nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({
      estimate: usdaEstimate,
      usda: { fdcId: 101, description: "Apple, raw", source: "name_search" }, // fell through
    });

    await runProcessScan(event, step);

    const data = db.foodItem.create.mock.calls[0][0].data;
    expect(data.usdaMatchSource).toBe("name_search");
    expect(data.usdaFdcId).toBe(101);
  });

  it("ignores a stray selection for a verified ingredient (verified precedence is structural)", async () => {
    assemblyMock.assembleMealUsdaCandidates.mockResolvedValue([
      { ingredientName: "apple", verified: { fdcId: 777, description: "Apple, raw, with skin" }, candidates: [] },
    ]);
    selectorMock.selectMatches.mockResolvedValue({
      status: "completed",
      selections: [{ ingredientName: "apple", fdcId: 999, rationale: "should be ignored" }],
    });
    nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({
      estimate: usdaEstimate,
      usda: { fdcId: 777, description: "Apple, raw, with skin", source: "verified_mapping" },
    });

    await runProcessScan(event, step);

    // Verified sets have no candidates, so no preselected match can be constructed.
    expect(nutritionMock.calculateNutritionWithProvenance).toHaveBeenCalledWith(
      expect.objectContaining({ name: "apple" }),
      expect.anything(),
      undefined,
    );
    const data = db.foodItem.create.mock.calls[0][0].data;
    expect(data.usdaFdcId).toBe(777);
    expect(data.usdaMatchSource).toBe("verified_mapping");
  });

  it("a selector failure never fails the meal", async () => {
    selectorMock.selectMatches.mockRejectedValue(new Error("OpenAI offline"));

    const result = await runProcessScan(event, step);

    expect(result).toEqual({ status: "identified" });
    const data = db.foodItem.create.mock.calls[0][0].data;
    expect(data.usdaFdcId).toBeNull();
    expect(data.usdaMatchSource).toBeNull();
  });
});
