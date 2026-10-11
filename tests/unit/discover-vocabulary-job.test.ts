import { beforeEach, describe, expect, it, vi } from "vitest";

const discoverMock = vi.hoisted(() => ({ discoverFoodVocabulary: vi.fn() }));
vi.mock("@/lib/services/nutrition/discover-food-vocabulary", () => ({
  discoverFoodVocabulary: discoverMock.discoverFoodVocabulary,
}));

import { runVocabularyDiscovery } from "@/lib/jobs/discover-vocabulary";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("discover-vocabulary Inngest job", () => {
  it("runs discovery for a trimmed event description", async () => {
    discoverMock.discoverFoodVocabulary.mockResolvedValue({ status: "no_candidate" });

    const result = await runVocabularyDiscovery({ description: "  steak  " });

    expect(discoverMock.discoverFoodVocabulary).toHaveBeenCalledWith("steak");
    expect(result).toEqual({ status: "no_candidate" });
  });

  it("rejects invalid payloads without calling discovery", async () => {
    expect(await runVocabularyDiscovery({})).toEqual({ status: "invalid" });
    expect(await runVocabularyDiscovery({ description: "   " })).toEqual({ status: "invalid" });
    expect(discoverMock.discoverFoodVocabulary).not.toHaveBeenCalled();
  });

  it("propagates discovery failures so Inngest can retry", async () => {
    discoverMock.discoverFoodVocabulary.mockRejectedValue(new Error("Database unavailable"));

    await expect(runVocabularyDiscovery({ description: "steak" })).rejects.toThrow("Database unavailable");
  });
});
