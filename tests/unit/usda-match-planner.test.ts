import { describe, expect, it } from "vitest";
import { candidateIsCompatible, planUsdaSearches } from "@/lib/services/nutrition/usda-match-planner";

describe("USDA match planning", () => {
  it("creates bounded bacon searches without discarding cooking method", () => {
    expect(planUsdaSearches("fried bacon pieces")).toEqual([
      "fried bacon pieces", "bacon cooked pan fried", "pork bacon cooked pan fried",
    ]);
  });
  it("does not invent a cheese variety", () => {
    expect(planUsdaSearches("grated cheese")).toEqual([]);
    expect(candidateIsCompatible("grated cheese", "Cheese, parmesan")).toBe(false);
  });
  it("keeps tomato sauce searchable", () => {
    expect(planUsdaSearches("tomato sauce")).toEqual(["tomato sauce"]);
  });
  it("rejects contradictory animal and cooking methods", () => {
    expect(candidateIsCompatible("fried bacon pieces", "Turkey bacon, cooked, pan-fried")).toBe(false);
    expect(candidateIsCompatible("fried bacon pieces", "Pork, cured, bacon, raw")).toBe(false);
    expect(candidateIsCompatible("fried bacon pieces", "Pork, cured, bacon, cooked, pan-fried")).toBe(true);
  });
  it("does not accept a non-gnocchi food", () => {
    expect(candidateIsCompatible("gnocchi", "Pasta, cooked")).toBe(false);
  });
});
