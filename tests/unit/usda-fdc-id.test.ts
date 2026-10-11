import { afterEach, describe, expect, it, vi } from "vitest";
import { createUsdaClient } from "@/lib/services/nutrition/usda-provider";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const detail = {
  fdcId: 12345,
  description: "Pork, cured, bacon, cooked, pan-fried",
  dataType: "SR Legacy",
  foodNutrients: [
    { nutrient: { id: 1008, unitName: "kcal" }, amount: 541 },
    { nutrient: { id: 1003, unitName: "g" }, amount: 37 },
    { nutrient: { id: 1005, unitName: "g" }, amount: 1.4 },
    { nutrient: { id: 1004, unitName: "g" }, amount: 42 },
  ],
};

describe("USDA verified ID lookup", () => {
  it("retrieves and parses detail nutrient records by FDC ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }));
    globalThis.fetch = fetchMock;
    const nutrition = await createUsdaClient("test-key").lookupByFdcId(12345);
    expect(nutrition).toMatchObject({ calories: 541, proteinG: 37, carbsG: 1.4, fatG: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/food/12345?");
  });

  it("rejects invalid IDs without calling USDA", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    expect(await createUsdaClient("test-key").lookupByFdcId(-1)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat incomplete nutrients as zero", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...detail,
      foodNutrients: detail.foodNutrients.slice(0, 2),
    }), { status: 200 }));
    expect(await createUsdaClient("test-key").lookupByFdcId(12345)).toBeNull();
  });

  it("rejects branded records for verified reference lookups", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...detail, dataType: "Branded",
    }), { status: 200 }));
    expect(await createUsdaClient("test-key").lookupByFdcId(12345)).toBeNull();
  });
});
