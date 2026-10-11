import { afterEach, describe, expect, it, vi } from "vitest";
import { createUsdaClient } from "@/lib/services/nutrition/usda-provider";

// Note: tests/setup.ts blanks USDA_FDC_API_KEY globally; these tests pass an
// explicit key to createUsdaClient, so they remain fully self-contained.

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

type Macros = [number, number, number, number];

/** Mock an FDC foods/search response: [kcal, proteinG, carbsG, fatG] per 100g. */
function mockSearch(foods: Array<{ description: string; macros: Macros }>) {
  const payload = {
    foods: foods.map((food, index) => ({
      // The real FDC search response always includes an fdcId; the match path requires it.
      fdcId: 1000 + index,
      description: food.description,
      dataType: "Survey (FNDDS)",
      foodNutrients: [
        { nutrientId: 1008, unitName: "kcal", value: food.macros[0] },
        { nutrientId: 1003, unitName: "g", value: food.macros[1] },
        { nutrientId: 1005, unitName: "g", value: food.macros[2] },
        { nutrientId: 1004, unitName: "g", value: food.macros[3] },
      ],
    })),
  };
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
}

describe("USDA name-search prefix compatibility", () => {
  it("never resolves 'steak' to 'Steak sauce' (the observed production mismatch)", async () => {
    mockSearch([
      { description: "Steak sauce", macros: [95, 1.25, 22.04, 0.23] },
      { description: "Steak sandwich", macros: [250, 12, 24, 11] },
    ]);

    // No compatible candidate -> null, so the caller falls back to labeled approximate values.
    expect(await createUsdaClient("test-key").lookupByName("steak")).toBeNull();
  });

  it("still accepts prefix matches whose extra words are preparation or cut qualifiers", async () => {
    mockSearch([
      { description: "Steak sauce", macros: [95, 1.25, 22.04, 0.23] },
      { description: "Steak, broiled", macros: [210, 28, 0, 10] },
    ]);

    const nutrition = await createUsdaClient("test-key").lookupByName("steak");
    expect(nutrition).toMatchObject({ calories: 210, proteinG: 28, carbsG: 0, fatG: 10 });
  });

  it("rejects other misleading prefix matches across food categories", async () => {
    mockSearch([{ description: "Apple pie", macros: [237, 1.9, 34, 11] }]);
    expect(await createUsdaClient("test-key").lookupByName("apple")).toBeNull();

    mockSearch([{ description: "Beef, sandwich steak", macros: [260, 15, 12, 16] }]);
    expect(await createUsdaClient("test-key").lookupByName("beef")).toBeNull();

    mockSearch([{ description: "Chicken soup", macros: [45, 4, 5, 1.5] }]);
    expect(await createUsdaClient("test-key").lookupByName("chicken")).toBeNull();
  });

  it("keeps exact phrase matches and compatible long qualifier suffixes", async () => {
    mockSearch([
      { description: "Chicken, broilers or fryers, breast, meat only, cooked, roasted", macros: [165, 31, 0, 3.6] },
    ]);
    expect(await createUsdaClient("test-key").lookupByName("chicken"))
      .toMatchObject({ calories: 165, proteinG: 31, fatG: 3.6 });

    mockSearch([{ description: "Rice, white, cooked", macros: [130, 2.7, 28, 0.3] }]);
    expect(await createUsdaClient("test-key").lookupByName("rice"))
      .toMatchObject({ calories: 130, carbsG: 28 });
  });

  it("never resolves generic 'steak' to raw-preparation dishes (tartare, carpaccio)", async () => {
    mockSearch([
      { description: "Steak tartare", macros: [198, 20, 1, 12] },
      { description: "Steak carpaccio", macros: [150, 22, 0, 6] },
    ]);

    // Raw dishes are materially different from a cooked steak: no match, approximate fallback.
    expect(await createUsdaClient("test-key").lookupByName("steak")).toBeNull();
  });

  it("keeps cooked steak records eligible while rejecting raw-preparation dishes", async () => {
    mockSearch([
      { description: "Steak tartare", macros: [198, 20, 1, 12] },
      { description: "Steak, broiled", macros: [210, 28, 0, 10] },
    ]);

    expect(await createUsdaClient("test-key").lookupByName("steak"))
      .toMatchObject({ calories: 210, proteinG: 28 });
  });

  it("keeps canonical raw records for foods eaten raw (apple -> Apple, raw)", async () => {
    mockSearch([{ description: "Apple, raw", macros: [52, 0.3, 14, 0.2] }]);

    expect(await createUsdaClient("test-key").lookupByName("apple"))
      .toMatchObject({ calories: 52, carbsG: 14 });
  });
});
