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
  it("rejects a USDA pasta dish with frankfurters for pasta with tomato sauce", () => {
    expect(candidateIsCompatible("pasta with tomato sauce", "Pasta with Sliced Frankfurters")).toBe(false);
    expect(candidateIsCompatible("pasta with tomato sauce", "Pasta with tomato sauce")).toBe(true);
  });
  it("rejects extra substantive ingredients even when requested words overlap", () => {
    expect(candidateIsCompatible("pasta with tomato sauce", "Pasta with tomato sauce and sausage")).toBe(false);
    expect(candidateIsCompatible("tomato sauce", "Tomato sauce with mushrooms")).toBe(false);
  });
  it("rejects missing components and unrelated foods", () => {
    expect(candidateIsCompatible("pasta with tomato sauce", "Pasta, cooked")).toBe(false);
    expect(candidateIsCompatible("pistachios", "Almonds, raw")).toBe(false);
  });
  it("does not accept a non-gnocchi food", () => {
    expect(candidateIsCompatible("gnocchi", "Pasta, cooked")).toBe(false);
  });
});
