import { describe, expect, it } from "vitest";
import { approximateFoodNutrition } from "@/lib/services/nutrition/approximate-food-nutrition";

describe("approximate food nutrition fallback", () => {
  it("provides cooked pasta reference nutrients", () => {
    expect(approximateFoodNutrition("Spaghetti pasta")).toMatchObject({
      calories: 158, isApproximate: true,
    });
  });

  it("estimates fresh basil without reporting zero calories", () => {
    const estimate = approximateFoodNutrition("Basil leaves");
    expect(estimate?.calories).toBeGreaterThan(0);
    expect(estimate?.uncertaintyReason).toContain("Generic");
  });

  it("offers an explicitly approximate generic cheese reference", () => {
    expect(approximateFoodNutrition("Grated cheese")).toMatchObject({
      calories: 390, isApproximate: true,
    });
  });

  it("covers tomato sauce and gnocchi", () => {
    expect(approximateFoodNutrition("tomato sauce")?.calories).toBeGreaterThan(0);
    expect(approximateFoodNutrition("gnocchi")?.calories).toBeGreaterThan(0);
  });

  it("does not invent nutrition for unidentified foods", () => {
    expect(approximateFoodNutrition("unknown food")).toBeNull();
  });
});

describe("expanded common-food coverage", () => {
  it("covers staple grains, proteins, and produce", () => {
    expect(approximateFoodNutrition("cooked white rice")).toMatchObject({ calories: 130, isApproximate: true });
    expect(approximateFoodNutrition("grilled chicken")?.proteinG).toBe(31);
    expect(approximateFoodNutrition("broccoli")?.calories).toBeGreaterThan(0);
    expect(approximateFoodNutrition("apple")).toMatchObject({ calories: 52, isApproximate: true });
  });

  it("covers oils, condiments, and toppings that rarely match USDA by name", () => {
    expect(approximateFoodNutrition("olive oil")).toMatchObject({ calories: 884, fatG: 100 });
    expect(approximateFoodNutrition("butter")?.fatG).toBe(81);
    expect(approximateFoodNutrition("mayonnaise")?.calories).toBeGreaterThan(0);
    expect(approximateFoodNutrition("cheddar cheese")?.proteinG).toBe(25);
  });

  it("provides a generic steak fallback without assuming a specific cut", () => {
    const estimate = approximateFoodNutrition("steak");
    expect(estimate).toMatchObject({ calories: 210, proteinG: 28, carbsG: 0, fatG: 10, isApproximate: true });
    expect(estimate?.uncertaintyReason).toContain("Generic");
    expect(approximateFoodNutrition("grilled steak")).toMatchObject({ calories: 210, proteinG: 28 });
  });
});

describe("sauce category estimates", () => {
  it("estimates tomato-based sauces from description keywords", () => {
    const estimate = approximateFoodNutrition("homemade marinara");
    expect(estimate).toMatchObject({ calories: 35, isApproximate: true });
    expect(estimate?.uncertaintyReason).toContain("tomato-based");
  });

  it("distinguishes cream-based sauces from tomato-based sauces", () => {
    const cream = approximateFoodNutrition("garlic cream sauce");
    const tomato = approximateFoodNutrition("spicy arrabbiata sauce");
    expect(cream?.uncertaintyReason).toContain("cream-based");
    expect(tomato?.uncertaintyReason).toContain("tomato-based");
    expect(cream?.fatG).toBeGreaterThan(tomato?.fatG ?? 0);
  });

  it("distinguishes oil-based sauces and dressings", () => {
    const estimate = approximateFoodNutrition("basil pesto");
    expect(estimate?.uncertaintyReason).toContain("oil-based");
    expect(estimate?.fatG).toBeGreaterThan(0);
  });

  it("keeps broad category estimates clearly distinct from the generic reference tier", () => {
    const broad = approximateFoodNutrition("garlic cream sauce");
    const generic = approximateFoodNutrition("tomato sauce");
    expect(broad?.uncertaintyReason).toContain("Broad");
    expect(generic?.uncertaintyReason).toContain("Generic");
    expect(broad?.uncertaintyReason).not.toBe(generic?.uncertaintyReason);
  });

  it("does not treat every sauce as equivalent or invent nutrition for unknown sauces", () => {
    expect(approximateFoodNutrition("sauce")).toBeNull();
    expect(approximateFoodNutrition("teriyaki sauce")).toBeNull();
    expect(approximateFoodNutrition("mystery loaf")).toBeNull();
  });
});
