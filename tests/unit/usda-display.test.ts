import { describe, expect, it } from "vitest";
import { conciseUsdaLabel, conciseUsdaOptionLabels, usdaMatchDisplayLabel } from "@/lib/usda-display";

describe("conciseUsdaLabel", () => {
  it("drops preparation, grade, trim, and packaging qualifiers", () => {
    expect(conciseUsdaLabel(
      'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled',
    )).toBe("Beef, shoulder steak");
    expect(conciseUsdaLabel("Sauce, peppercorn, restaurant")).toBe("Sauce, peppercorn");
  });

  it("never collapses different foods into the same label", () => {
    const labels = [
      "Steak, broiled",
      "Steak sauce",
      "Sauce, chocolate, ready-to-serve",
      "Sauce, peppercorn, restaurant",
      "Apple, raw",
      "Apple, dried, sulfured",
      "Rice, white, cooked",
      "Rice, brown, cooked",
    ].map(conciseUsdaLabel);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toBe("Steak, broiled");
    expect(labels[1]).toBe("Steak sauce");
  });

  it("keeps two-segment restaurant/brand records fully readable", () => {
    expect(conciseUsdaLabel("CRACKER BARREL, grilled sirloin steak"))
      .toBe("CRACKER BARREL, grilled sirloin steak");
  });

  it("handles single-segment and empty descriptions without inventing text", () => {
    expect(conciseUsdaLabel("Apples")).toBe("Apples");
    expect(conciseUsdaLabel("")).toBe("");
  });
});

describe("usdaMatchDisplayLabel", () => {
  it("prefers the ingredient display name when it already matches the USDA record", () => {
    expect(usdaMatchDisplayLabel("steak sauce", "Steak sauce")).toBe("steak sauce");
    expect(usdaMatchDisplayLabel("steak sauce", "Sauce, steak")).toBe("steak sauce");
    expect(usdaMatchDisplayLabel("Apple", "apple!!")).toBe("Apple");
  });

  it("uses the concise USDA label when the record adds real qualification", () => {
    expect(usdaMatchDisplayLabel("dark sauce", "Sauce, peppercorn, restaurant")).toBe("Sauce, peppercorn");
    expect(usdaMatchDisplayLabel("rice", "Rice, white, cooked")).toBe("Rice, white");
    // Display normalization is deliberately minimal — plural differences use the USDA label.
    expect(usdaMatchDisplayLabel("Apple", "Apples, raw")).toBe("Apples, raw");
    expect(usdaMatchDisplayLabel("grilled steak", "CRACKER BARREL, grilled sirloin steak"))
      .toBe("CRACKER BARREL, grilled sirloin steak");
  });
});

describe("conciseUsdaOptionLabels", () => {
  const fndds = (fdcId: number, description: string) => ({ fdcId, description, dataType: "Survey (FNDDS)" });

  it("keeps meaningful dish names readable and removes routine metadata", () => {
    const options = conciseUsdaOptionLabels([
      fndds(2705914, "Venison, steak"),
      fndds(2706387, "Steak teriyaki"),
      fndds(2706394, "Steak tartare"),
      fndds(2706732, "Swiss steak"),
      fndds(2706747, "Pepper steak"),
    ]);

    expect(options.map((option) => option.label)).toEqual([
      "Venison, steak",
      "Steak teriyaki",
      "Steak tartare",
      "Swiss steak",
      "Pepper steak",
    ]);
    for (const option of options) {
      expect(option.label).not.toContain("FDC");
      expect(option.label).not.toContain("Survey");
    }
  });

  it("appends only the minimum distinguishing qualifier when labels would collide", () => {
    const options = conciseUsdaOptionLabels([
      { fdcId: 171785, description: 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled', dataType: "SR Legacy" },
      { fdcId: 171786, description: 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, select, cooked, grilled', dataType: "SR Legacy" },
      { fdcId: 168731, description: 'Beef, shoulder steak, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled', dataType: "SR Legacy" },
    ]);

    // Grade (choice/select) and fat retention (lean only) are the meaningful distinctions,
    // appended minimally per option; routine segments (boneless, trimmed, cooked) stay hidden.
    expect(options.map((option) => option.label)).toEqual([
      "Beef, shoulder steak · separable lean and fat · choice",
      "Beef, shoulder steak · separable lean and fat · select",
      "Beef, shoulder steak · separable lean only",
    ]);
  });

  it("falls back to an FDC suffix only for fully identical descriptions", () => {
    const options = conciseUsdaOptionLabels([
      { fdcId: 11, description: "Steak sauce", dataType: "Survey (FNDDS)" },
      { fdcId: 22, description: "Steak sauce", dataType: "SR Legacy" },
    ]);

    expect(options[0].label).toBe("Steak sauce · FDC 11");
    expect(options[1].label).toBe("Steak sauce · FDC 22");
  });

  it("retains the complete description, data type, and FDC ID in the detail text", () => {
    const [option] = conciseUsdaOptionLabels([
      { fdcId: 2706732, description: "Swiss steak", dataType: "Survey (FNDDS)" },
    ]);

    expect(option.detail).toBe("Swiss steak · Survey (FNDDS) · FDC 2706732");
    expect(option.fdcId).toBe(2706732);
  });
});
