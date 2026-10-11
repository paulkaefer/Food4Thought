import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  foodItem: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  dietaryConflictFlag: { updateMany: vi.fn(), findMany: vi.fn() },
  mealLogEntry: { update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const nutritionMock = vi.hoisted(() => ({
  calculateNutrition: vi.fn(),
  calculateNutritionWithProvenance: vi.fn(),
}));
vi.mock("@/lib/services/nutrition/calculate-nutrition", () => ({
  calculateNutrition: nutritionMock.calculateNutrition,
  calculateNutritionWithProvenance: nutritionMock.calculateNutritionWithProvenance,
}));

const scheduleMock = vi.hoisted(() => ({ scheduleVocabularyDiscovery: vi.fn() }));
vi.mock("@/lib/services/nutrition/schedule-discovery", () => ({
  scheduleVocabularyDiscovery: scheduleMock.scheduleVocabularyDiscovery,
}));

import { PATCH } from "@/app/api/v1/meal-log-entries/[id]/food-items/[foodItemId]/route";

const request = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const params = { params: { id: "meal-1", foodItemId: "item-1" } };

const existingItem = {
  id: "item-1",
  mealLogEntryId: "meal-1",
  name: "steak",
  portionAmount: 185,
  portionRangeMin: null,
  portionRangeMax: null,
  portionUnit: "g",
  portionIsApproximate: false,
  portionConfidenceWarning: null,
  usdaFdcId: null,
  usdaMatchSource: null,
  usdaDescription: null,
  usdaCandidates: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  db.foodItem.findUnique.mockResolvedValue(existingItem);
  nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({
    estimate: {
      calories: 388.5,
      proteinG: 51.8,
      carbsG: 0,
      fatG: 18.5,
      micronutrients: {},
      isApproximate: true,
      uncertaintyReason: "Generic food reference estimate; variety, ingredients and preparation may differ.",
    },
    usda: null,
  });
  db.foodItem.update.mockResolvedValue({ id: "item-1", name: "steak" });
  db.dietaryConflictFlag.findMany.mockResolvedValue([]);
  db.foodItem.count.mockResolvedValue(0);
  db.mealLogEntry.update.mockResolvedValue({});
});

describe("Correction route vocabulary hook", () => {
  it("queues candidate discovery for the confirmed name without verifying anything", async () => {
    const response = await PATCH(request({ confirmedName: "steak", resolveConflicts: [] }), params);
    const body = await response.json();

    expect(body.status).toBe("identified");
    expect(body.data.foodItem.name).toBe("steak");
    expect(scheduleMock.scheduleVocabularyDiscovery).toHaveBeenCalledWith("steak");
  });

  it("does not run discovery when the update fails validation", async () => {
    const response = await PATCH(request({ confirmedName: "", resolveConflicts: [] }), params);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(scheduleMock.scheduleVocabularyDiscovery).not.toHaveBeenCalled();
  });

  it("does not run discovery when the food item is not found", async () => {
    db.foodItem.findUnique.mockResolvedValue(null);

    const response = await PATCH(request({ confirmedName: "steak", resolveConflicts: [] }), params);

    expect(response.status).toBe(404);
    expect(scheduleMock.scheduleVocabularyDiscovery).not.toHaveBeenCalled();
  });

  it("keeps the correction successful when discovery scheduling fails", async () => {
    scheduleMock.scheduleVocabularyDiscovery.mockRejectedValue(new Error("Inngest offline"));

    const response = await PATCH(request({ confirmedName: "steak", resolveConflicts: [] }), params);
    const body = await response.json();

    expect(body.status).toBe("identified");
    expect(body.data.foodItem.name).toBe("steak");
  });
});
