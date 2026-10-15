import { describe, expect, it } from "vitest";
import {
  candidateEquivalenceKey,
  collapseToLogicalChoices,
  groupEquivalentCandidates,
} from "@/lib/services/nutrition/candidate-dedup";

/** The four near-identical shoulder-steak records observed in the real review queue. */
const STEAK_DUPLICATES = [
  { fdcId: 171786, description: 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, select, cooked, grilled', status: "verified" },
  { fdcId: 171785, description: 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled', status: "proposed" },
  { fdcId: 168731, description: 'Beef, shoulder steak, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled', status: "proposed" },
  { fdcId: 168732, description: 'Beef, shoulder steak, boneless, separable lean only, trimmed to 0" fat, select, cooked, grilled', status: "proposed" },
];

function candidate(fdcId: number, usdaDescription: string, status = "proposed", score = 0.5) {
  return { id: `c${fdcId}`, usdaFdcId: fdcId, usdaDescription, usdaDataType: "SR Legacy", score, status, createdAt: "" };
}

describe("candidateEquivalenceKey", () => {
  it("normalizes case, whitespace, and punctuation", () => {
    expect(candidateEquivalenceKey("Grilled Steak")).toBe(candidateEquivalenceKey("  grilled   steak! "));
    expect(candidateEquivalenceKey('Beef, steak, cooked')).toBe(candidateEquivalenceKey("beef steak cooked"));
  });

  it("treats equivalent word order as the same record", () => {
    expect(candidateEquivalenceKey("Sauce, steak")).toBe(candidateEquivalenceKey("steak sauce"));
  });

  it("collapses USDA quality grades (choice/select/prime/standard) of the same cut", () => {
    const base = 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, %s, cooked, grilled';
    const choice = candidateEquivalenceKey(base.replace("%s", "choice"));
    expect(candidateEquivalenceKey(base.replace("%s", "select"))).toBe(choice);
    expect(candidateEquivalenceKey(base.replace("%s", "prime"))).toBe(choice);
  });

  it("canonicalizes common plurals", () => {
    expect(candidateEquivalenceKey("Beef with tomatoes")).toBe(candidateEquivalenceKey("beef with tomato"));
    expect(candidateEquivalenceKey("Beef with potatoes")).toBe(candidateEquivalenceKey("beef with potato"));
  });

  it("distinguishes different cuts", () => {
    expect(candidateEquivalenceKey("Beef, sirloin steak, cooked, grilled"))
      .not.toBe(candidateEquivalenceKey("Beef, shoulder steak, cooked, grilled"));
  });

  it("distinguishes different preparation methods", () => {
    expect(candidateEquivalenceKey("Beef, steak, raw")).not.toBe(candidateEquivalenceKey("Beef, steak, cooked"));
    expect(candidateEquivalenceKey("Beef, steak, cooked, grilled"))
      .not.toBe(candidateEquivalenceKey("Beef, steak, cooked, roasted"));
  });

  it("distinguishes materially different nutrition (fat retention and trim level)", () => {
    const leanOnly = candidateEquivalenceKey('Beef, shoulder steak, separable lean only, trimmed to 0" fat, cooked, grilled');
    const leanAndFat = candidateEquivalenceKey('Beef, shoulder steak, separable lean and fat, trimmed to 0" fat, cooked, grilled');
    const eighthInch = candidateEquivalenceKey('Beef, shoulder steak, separable lean and fat, trimmed to 1/8" fat, cooked, grilled');
    expect(leanOnly).not.toBe(leanAndFat);
    expect(leanAndFat).not.toBe(eighthInch);
  });

  it("distinguishes sauces from meats and records with extra ingredients", () => {
    expect(candidateEquivalenceKey("Steak sauce")).not.toBe(candidateEquivalenceKey("Beef, steak, cooked"));
    expect(candidateEquivalenceKey("Steak sauce")).not.toBe(candidateEquivalenceKey("Sauce, steak, tomato based"));
  });
});

describe("groupEquivalentCandidates / collapseToLogicalChoices", () => {
  it("collapses exact duplicate steak records (same description, different FDC IDs)", () => {
    const choices = collapseToLogicalChoices([
      candidate(111, "Beef, steak, cooked, grilled"),
      candidate(222, "Beef, steak, cooked, grilled"),
    ]);
    expect(choices).toHaveLength(1);
    expect(choices[0].members.map((m) => m.usdaFdcId)).toEqual([111, 222]);
  });

  it("collapses the observed steak grade variants into two logical choices (fat retention kept distinct)", () => {
    const choices = collapseToLogicalChoices(
      STEAK_DUPLICATES.map((row) => candidate(row.fdcId, row.description, row.status, 0.143)),
    );
    expect(choices).toHaveLength(2);
    const memberIds = choices.map((choice) => choice.members.map((m) => m.usdaFdcId).sort((a, b) => a - b));
    expect(memberIds).toContainEqual([171785, 171786]);
    expect(memberIds).toContainEqual([168731, 168732]);
  });

  it("keeps a restaurant-branded sirloin distinct from generic shoulder steak", () => {
    const choices = collapseToLogicalChoices([
      ...STEAK_DUPLICATES.map((row) => candidate(row.fdcId, row.description, row.status, 0.143)),
      candidate(167670, "CRACKER BARREL, grilled sirloin steak", "proposed", 0.4),
    ]);
    expect(choices).toHaveLength(3);
  });

  it("prefers the verified record as representative so the live mapping stays visible", () => {
    const choices = collapseToLogicalChoices([
      candidate(171785, STEAK_DUPLICATES[1].description, "proposed", 0.9),
      candidate(171786, STEAK_DUPLICATES[0].description, "verified", 0.1),
    ]);
    expect(choices[0].representative.usdaFdcId).toBe(171786);
  });

  it("prefers proposed over rejected, then higher score, then lowest FDC ID", () => {
    const byStatus = collapseToLogicalChoices([
      candidate(1, "Beef, steak, cooked", "rejected", 0.9),
      candidate(2, "Beef, steak, cooked", "proposed", 0.1),
    ]);
    expect(byStatus[0].representative.usdaFdcId).toBe(2);

    const byScore = collapseToLogicalChoices([
      candidate(1, "Beef, steak, cooked", "proposed", 0.1),
      candidate(2, "Beef, steak, cooked", "proposed", 0.9),
    ]);
    expect(byScore[0].representative.usdaFdcId).toBe(2);

    const byId = collapseToLogicalChoices([
      candidate(9, "Beef, steak, cooked", "proposed", 0.5),
      candidate(3, "Beef, steak, cooked", "proposed", 0.5),
    ]);
    expect(byId[0].representative.usdaFdcId).toBe(3);
  });

  it("preserves first-appearance group order and never modifies member records", () => {
    const input = [
      candidate(1, "Beef, steak, cooked"),
      candidate(2, "Steak sauce"),
      candidate(3, "beef steak cooked"),
    ];
    const groups = groupEquivalentCandidates(input);
    expect(groups.map((group) => group[0].usdaFdcId)).toEqual([1, 2]);
    expect(input[0].status).toBe("proposed");
  });
});
