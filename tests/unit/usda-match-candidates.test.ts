import { afterEach, describe, expect, it, vi } from "vitest";
import { findUsdaMatchCandidates } from "@/lib/services/nutrition/usda-match-candidates";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

describe("USDA candidate search", () => {
  it("returns compatible bacon candidates, rejects raw/turkey, and deduplicates IDs", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      foods: [
        { fdcId: 10, description: "Pork, cured, bacon, cooked, pan-fried", dataType: "SR Legacy" },
        { fdcId: 11, description: "Pork, cured, bacon, raw", dataType: "SR Legacy" },
        { fdcId: 12, description: "Turkey bacon, cooked, pan-fried", dataType: "SR Legacy" },
        { fdcId: 10, description: "Pork, cured, bacon, cooked, pan-fried", dataType: "SR Legacy" },
      ],
    }), { status: 200 }));
    globalThis.fetch = fetchMock;
    const matches = await findUsdaMatchCandidates("fried bacon pieces", "test-key");
    expect(matches.map((item) => item.fdcId)).toEqual([10]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not search unspecified cheese varieties", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    expect(await findUsdaMatchCandidates("grated cheese", "test-key")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no candidates when the API key is absent", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    expect(await findUsdaMatchCandidates("gnocchi", "")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("admits extra-ingredient records into the review queue for human review", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      foods: [
        { fdcId: 20, description: "Steak, broiled", dataType: "Survey (FNDDS)" },
        { fdcId: 21, description: "Steak sauce", dataType: "Survey (FNDDS)" },
      ],
    }), { status: 200 }));
    globalThis.fetch = fetchMock;
    const matches = await findUsdaMatchCandidates("steak", "test-key");
    expect(matches.map((item) => item.fdcId)).toEqual(expect.arrayContaining([20, 21]));
    expect(matches).toHaveLength(2);
  });

  it("stops searching once the discovery time budget is exhausted", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    expect(await findUsdaMatchCandidates("fried bacon pieces", "test-key", -1)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
