import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  foodItem: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  dietaryConflictFlag: { updateMany: vi.fn(), findMany: vi.fn() },
  mealLogEntry: { update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const nutritionMock = vi.hoisted(() => ({ calculateNutritionWithProvenance: vi.fn() }));
vi.mock("@/lib/services/nutrition/calculate-nutrition", () => ({
  calculateNutritionWithProvenance: nutritionMock.calculateNutritionWithProvenance,
}));

const scheduleMock = vi.hoisted(() => ({ scheduleVocabularyDiscovery: vi.fn() }));
vi.mock("@/lib/services/nutrition/schedule-discovery", () => ({
  scheduleVocabularyDiscovery: scheduleMock.scheduleVocabularyDiscovery,
}));

import { PATCH } from "@/app/api/v1/meal-log-entries/[id]/food-items/[foodItemId]/route";

const request = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const params = { params: { id: "meal-1", foodItemId: "item-1" } };

const STORED_CANDIDATES = [
  { fdcId: 999001, description: "Sauce, chocolate, ready-to-serve", dataType: "SR Legacy", score: 0.4 },
  { fdcId: 999002, description: "Sauce, peppercorn, restaurant", dataType: "SR Legacy", score: 0.6 },
];

/** A stage-5 item: AI selected the chocolate sauce; the user knows better. */
const existingItem = {
  id: "item-1",
  mealLogEntryId: "meal-1",
  name: "dark sauce",
  portionAmount: 30,
  portionRangeMin: null,
  portionRangeMax: null,
  portionUnit: "g",
  portionIsApproximate: false,
  portionConfidenceWarning: null,
  usdaFdcId: 999001,
  usdaMatchSource: "ai_selected",
  usdaDescription: "Sauce, chocolate, ready-to-serve",
  usdaCandidates: STORED_CANDIDATES,
};

const gravyNutrition = {
  calories: 15,
  proteinG: 0.6,
  carbsG: 1.5,
  fatG: 0.9,
  micronutrients: {},
  isApproximate: true,
  uncertaintyReason: "USDA reference values; preparation and variety may differ.",
};

beforeEach(() => {
  vi.resetAllMocks();
  db.foodItem.findUnique.mockResolvedValue(existingItem);
  db.foodItem.update.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...existingItem, ...args.data }));
  db.foodItem.count.mockResolvedValue(0);
  db.dietaryConflictFlag.findMany.mockResolvedValue([]);
  db.mealLogEntry.update.mockResolvedValue({});
  scheduleMock.scheduleVocabularyDiscovery.mockResolvedValue(undefined);
  nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({
    estimate: gravyNutrition,
    usda: { fdcId: 999002, description: "Sauce, peppercorn, restaurant", source: "user_selected" },
  });
});

describe("PATCH food item — user-selected USDA override", () => {
  it("applies a valid user-selected candidate and recalculates nutrition immediately", async () => {
    const response = await PATCH(
      request({ confirmedName: "dark sauce", resolveConflicts: [], usdaFdcId: 999002 }),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(nutritionMock.calculateNutritionWithProvenance).toHaveBeenCalledWith(
      expect.objectContaining({ name: "dark sauce" }),
      expect.anything(),
      { fdcId: 999002, description: "Sauce, peppercorn, restaurant", source: "user_selected" },
    );
    const data = db.foodItem.update.mock.calls[0][0].data;
    expect(data.usdaFdcId).toBe(999002);
    expect(data.usdaMatchSource).toBe("user_selected");
    expect(data.usdaDescription).toBe("Sauce, peppercorn, restaurant");
    expect(data.calories).toBe(15);
    // The candidate list stays available for further corrections (name unchanged).
    expect("usdaCandidates" in data).toBe(false);
    // The UI recomputes meal totals from this updated item.
    expect(body.data.foodItem.calories).toBe(15);
    expect(body.data.foodItem.usdaMatchSource).toBe("user_selected");
  });

  it("rejects an FDC ID that is not among the stored candidates, without touching the meal", async () => {
    const response = await PATCH(
      request({ confirmedName: "dark sauce", resolveConflicts: [], usdaFdcId: 555555 }),
      params,
    );

    expect(response.status).toBe(400);
    expect(db.foodItem.update).not.toHaveBeenCalled();
    expect(nutritionMock.calculateNutritionWithProvenance).not.toHaveBeenCalled();
    expect(scheduleMock.scheduleVocabularyDiscovery).not.toHaveBeenCalled();
  });

  it("rejects the override when the USDA detail lookup cannot serve the record", async () => {
    // The chosen record's lookup failed, so nutrition fell through to the name search.
    nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({
      estimate: gravyNutrition,
      usda: { fdcId: 169756, description: "Sauce, brown", source: "name_search" },
    });

    const response = await PATCH(
      request({ confirmedName: "dark sauce", resolveConflicts: [], usdaFdcId: 999002 }),
      params,
    );

    expect(response.status).toBe(502);
    expect(db.foodItem.update).not.toHaveBeenCalled();
  });

  it("keeps serving the AI-selected record on a plain same-name confirmation", async () => {
    nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({
      estimate: gravyNutrition,
      usda: { fdcId: 999001, description: "Sauce, chocolate, ready-to-serve", source: "ai_selected" },
    });

    const response = await PATCH(request({ confirmedName: "Dark Sauce", resolveConflicts: [] }), params);

    expect(response.status).toBe(200);
    expect(nutritionMock.calculateNutritionWithProvenance).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { fdcId: 999001, description: "Sauce, chocolate, ready-to-serve", source: "ai_selected" },
    );
    const data = db.foodItem.update.mock.calls[0][0].data;
    expect(data.usdaMatchSource).toBe("ai_selected");
    expect("usdaCandidates" in data).toBe(false);
  });

  it("clears the stale candidate list and re-matches fresh when the name changes", async () => {
    nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({
      estimate: gravyNutrition,
      usda: { fdcId: 169756, description: "Gravy, beef, canned", source: "name_search" },
    });

    const response = await PATCH(request({ confirmedName: "beef gravy", resolveConflicts: [] }), params);

    expect(response.status).toBe(200);
    // No preselected record for a renamed ingredient: the fresh name drives matching.
    expect(nutritionMock.calculateNutritionWithProvenance).toHaveBeenCalledWith(
      expect.objectContaining({ name: "beef gravy" }),
      expect.anything(),
      undefined,
    );
    const data = db.foodItem.update.mock.calls[0][0].data;
    expect(data.usdaCandidates).toEqual([]);
    expect(data.usdaFdcId).toBe(169756);
    expect(data.usdaMatchSource).toBe("name_search");
  });

  it("treats a legacy item (no stored match) exactly like the pre-stage-5 behavior", async () => {
    db.foodItem.findUnique.mockResolvedValue({
      ...existingItem,
      name: "steak",
      usdaFdcId: null,
      usdaMatchSource: null,
      usdaDescription: null,
      usdaCandidates: null,
    });
    nutritionMock.calculateNutritionWithProvenance.mockResolvedValue({ estimate: gravyNutrition, usda: null });

    const response = await PATCH(request({ confirmedName: "steak", resolveConflicts: [] }), params);

    expect(response.status).toBe(200);
    expect(nutritionMock.calculateNutritionWithProvenance).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
    );
    const data = db.foodItem.update.mock.calls[0][0].data;
    expect(data.usdaFdcId).toBeNull();
    expect(data.usdaMatchSource).toBeNull();
  });

  it("never promotes the user selection into shared vocabulary", async () => {
    await PATCH(request({ confirmedName: "dark sauce", resolveConflicts: [], usdaFdcId: 999002 }), params);

    // The only vocabulary interaction is the existing discovery scheduling hook.
    expect(scheduleMock.scheduleVocabularyDiscovery).toHaveBeenCalledWith("dark sauce");
    expect(db.foodItem.update.mock.calls[0][0].data.usdaMatchSource).toBe("user_selected");
  });
});
