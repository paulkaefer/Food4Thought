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

import { runProcessScan, type ProcessScanStep } from "@/lib/jobs/process-scan";

/** Inngest-free step runner: executes each step inline and returns its value. */
const step: ProcessScanStep = {
  run: async <T,>(_name: string, fn: () => Promise<T> | T): Promise<T> => fn(),
};

const event = { mealLogEntryId: "m1", photoUrl: "multi-item", userId: "u1" };

function candidateSet(
  ingredientName: string,
  fdcId: number,
  verified: { fdcId: number; description: string } | null = null,
) {
  return {
    ingredientName,
    verified,
    candidates: verified
      ? []
      : [{ fdcId, description: `USDA record ${fdcId}`, dataType: "SR Legacy", score: 0.5 }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.mealLogEntry.update.mockResolvedValue({});
  db.foodItem.create.mockResolvedValue({});
  db.dietaryRestriction.findMany.mockResolvedValue([]);
  db.foodVocabulary.findUnique.mockResolvedValue(null);
  db.foodVocabulary.update.mockResolvedValue({});
  db.foodMappingCandidate.findMany.mockResolvedValue([]);
  db.foodMappingCandidate.findFirst.mockResolvedValue(null);
});

describe("process-scan FoodItem USDA persistence", () => {
  it("persists the assembled candidate set on every food item", async () => {
    assemblyMock.assembleMealUsdaCandidates.mockResolvedValue([
      candidateSet("grilled chicken", 101),
      candidateSet("rice", 202),
      candidateSet("broccoli", 303),
    ]);

    const result = await runProcessScan(event, step);

    expect(result).toEqual({ status: "identified" });
    expect(assemblyMock.assembleMealUsdaCandidates).toHaveBeenCalledWith(["grilled chicken", "rice", "broccoli"]);
    expect(db.foodItem.create).toHaveBeenCalledTimes(3);
    for (const [name, fdcId] of [["grilled chicken", 101], ["rice", 202], ["broccoli", 303]] as const) {
      const call = db.foodItem.create.mock.calls.find((c) => c[0].data.name === name);
      expect(call?.[0].data.usdaCandidates).toEqual([
        { fdcId, description: `USDA record ${fdcId}`, dataType: "SR Legacy", score: 0.5 },
      ]);
      expect(call?.[0].data.usdaFdcId).toBeNull();
      expect(call?.[0].data.usdaMatchSource).toBeNull();
      expect(call?.[0].data.usdaDescription).toBeNull();
    }
  });

  it("records verified-mapping provenance and an empty candidate list for mapped ingredients", async () => {
    assemblyMock.assembleMealUsdaCandidates.mockResolvedValue([
      candidateSet("grilled chicken", 0, { fdcId: 777, description: "Chicken, broiler, cooked, grilled" }),
      candidateSet("rice", 202),
      candidateSet("broccoli", 303),
    ]);

    await runProcessScan(event, step);

    const call = db.foodItem.create.mock.calls.find((c) => c[0].data.name === "grilled chicken");
    expect(call?.[0].data.usdaFdcId).toBe(777);
    expect(call?.[0].data.usdaMatchSource).toBe("verified_mapping");
    expect(call?.[0].data.usdaDescription).toBe("Chicken, broiler, cooked, grilled");
    expect(call?.[0].data.usdaCandidates).toEqual([]);
  });

  it("leaves the USDA columns at database defaults when assembly fails, without failing the scan", async () => {
    assemblyMock.assembleMealUsdaCandidates.mockRejectedValue(new Error("USDA offline"));

    const result = await runProcessScan(event, step);

    expect(result).toEqual({ status: "identified" });
    expect(db.foodItem.create).toHaveBeenCalledTimes(3);
    for (const call of db.foodItem.create.mock.calls) {
      expect("usdaFdcId" in call[0].data).toBe(false);
      expect("usdaMatchSource" in call[0].data).toBe(false);
      expect("usdaCandidates" in call[0].data).toBe(false);
    }
  });

  it("keeps the existing nutrition calculation unchanged (approximate fallback scales by portion)", async () => {
    assemblyMock.assembleMealUsdaCandidates.mockResolvedValue([
      candidateSet("grilled chicken", 101),
      candidateSet("rice", 202),
      candidateSet("broccoli", 303),
    ]);

    await runProcessScan(event, step);

    // Stub fixture: exact 120g portion of generic "rice" (130 kcal per 100g reference).
    const rice = db.foodItem.create.mock.calls.find((c) => c[0].data.name === "rice");
    expect(rice?.[0].data.calories).toBeCloseTo(156);
    expect(rice?.[0].data.dataSource).toBe("visual_estimate");
  });
});
