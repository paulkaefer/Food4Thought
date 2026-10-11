import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OpenAiUsdaMatchSelector,
  StubUsdaMatchSelector,
  selectionRequired,
  validateAiMatchSelections,
} from "@/lib/services/nutrition/ai-match-selector";
import type { IngredientUsdaCandidateSet } from "@/lib/services/nutrition/meal-candidates";
import type { MealContext } from "@/lib/services/vision/provider";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;

function set(
  ingredientName: string,
  candidates: Array<[number, string]>,
  verified: { fdcId: number; description: string } | null = null,
): IngredientUsdaCandidateSet {
  return {
    ingredientName,
    verified,
    candidates: candidates.map(([fdcId, description]) => ({
      fdcId,
      description,
      dataType: "SR Legacy",
      score: 0.5,
    })),
  };
}

const STEAK_SETS = [
  set("grilled steak", [
    [167670, "CRACKER BARREL, grilled sirloin steak"],
    [171785, 'Beef, shoulder steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled'],
  ]),
  set("dark sauce", [
    [999001, "Sauce, chocolate, ready-to-serve"],
    [999002, "Sauce, peppercorn, restaurant"],
    [999003, "Gravy, beef, canned"],
  ]),
];

const STEAKHOUSE: MealContext = {
  preparation: "grilled",
  accompaniments: "grilled steak, mashed potatoes",
  cuisineClues: "steakhouse plating",
  observations: "dark glossy sauce on the steak",
};

function selectionsResponse(selections: unknown) {
  return new Response(
    JSON.stringify({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify({ selections }) }],
      }],
    }),
    { status: 200 },
  );
}

function promptBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): string {
  const body = JSON.parse((fetchMock.mock.calls[call][1] as { body: string }).body) as {
    input: Array<{ content: Array<{ type: string; text?: string }> }>;
  };
  return body.input[0].content.find((part) => part.type === "input_text")?.text ?? "";
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalKey;
  }
});

describe("OpenAiUsdaMatchSelector", () => {
  it("selects contextually plausible candidates using the full meal context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(selectionsResponse([
      { ingredient: "grilled steak", fdcId: 171785, rationale: "Shoulder steak matches the visible grilled cut." },
      { ingredient: "dark sauce", fdcId: 999002, rationale: "Dark glossy sauce on steak is most plausibly peppercorn." },
    ]));
    globalThis.fetch = fetchMock;

    const result = await new OpenAiUsdaMatchSelector()
      .selectMatches(STEAK_SETS, STEAKHOUSE, "steakhouse dinner");

    expect(result.status).toBe("completed");
    expect(result.selections).toEqual([
      { ingredientName: "grilled steak", fdcId: 171785, rationale: "Shoulder steak matches the visible grilled cut." },
      { ingredientName: "dark sauce", fdcId: 999002, rationale: "Dark glossy sauce on steak is most plausibly peppercorn." },
    ]);

    // The prompt carries the complete meal context, both ingredient lists, and the
    // contextual-reasoning rules (savory sauce on steak, soy/oyster/black-bean on stir-fry).
    const prompt = promptBody(fetchMock);
    expect(prompt).toContain("dark glossy sauce on the steak");
    expect(prompt).toContain("Accompanying foods: grilled steak, mashed potatoes");
    expect(prompt).toContain("steakhouse dinner");
    expect(prompt).toContain("peppercorn sauce, or red-wine reduction");
    expect(prompt).toContain("soy-, oyster-, or black-bean-based");
    expect(prompt).toContain('fdcId 999001: "Sauce, chocolate, ready-to-serve"');
    expect(prompt).toContain("grilled steak, dark sauce");
  });

  it("passes abstention through when the evidence cannot distinguish candidates", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(selectionsResponse([
      { ingredient: "grilled steak", fdcId: null, rationale: "Cannot distinguish restaurant sirloin from shoulder steak." },
      { ingredient: "dark sauce", fdcId: null, rationale: "Insufficient evidence between peppercorn and beef gravy." },
    ]));

    const result = await new OpenAiUsdaMatchSelector().selectMatches(STEAK_SETS, STEAKHOUSE);

    expect(result.status).toBe("completed");
    expect(result.selections.map((s) => s.fdcId)).toEqual([null, null]);
    expect(result.selections[1].rationale).toBe("Insufficient evidence between peppercorn and beef gravy.");
  });

  it("rejects hallucinated FDC IDs that are not among the ingredient's candidates", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(selectionsResponse([
      { ingredient: "grilled steak", fdcId: 171785, rationale: "ok" },
      { ingredient: "dark sauce", fdcId: 555555, rationale: "invented" },
    ]));

    const result = await new OpenAiUsdaMatchSelector().selectMatches(STEAK_SETS, STEAKHOUSE);

    expect(result.selections[0].fdcId).toBe(171785);
    expect(result.selections[1].fdcId).toBeNull();
    expect(result.selections[1].rationale).toContain("Rejected FDC ID 555555");
  });

  it("rejects cross-ingredient IDs (a valid candidate of another ingredient)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(selectionsResponse([
      { ingredient: "grilled steak", fdcId: 999002, rationale: "peppered steak" }, // belongs to "dark sauce"
      { ingredient: "dark sauce", fdcId: 999002, rationale: "peppercorn fits" },
    ]));

    const result = await new OpenAiUsdaMatchSelector().selectMatches(STEAK_SETS, STEAKHOUSE);

    expect(result.selections[0].fdcId).toBeNull();
    expect(result.selections[0].rationale).toContain("Rejected FDC ID 999002");
    expect(result.selections[1].fdcId).toBe(999002);
  });

  it("abstains on ingredients the model omitted and ignores unknown ingredient names", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(selectionsResponse([
      { ingredient: "grilled steak", fdcId: 167670, rationale: "ok" },
      { ingredient: "pizza", fdcId: 1, rationale: "not in this meal" },
    ]));

    const result = await new OpenAiUsdaMatchSelector().selectMatches(STEAK_SETS, STEAKHOUSE);

    expect(result.selections).toHaveLength(2);
    expect(result.selections[0].fdcId).toBe(167670);
    expect(result.selections[1]).toMatchObject({ ingredientName: "dark sauce", fdcId: null });
    expect(result.selections[1].rationale).toContain("No selection returned");
  });

  it("makes ONE batched text-only call per meal, regardless of ingredient count", async () => {
    const threeSets = [
      ...STEAK_SETS,
      set("mashed potatoes", [[111, "Potatoes, mashed, home-prepared"]]),
    ];
    const fetchMock = vi.fn().mockResolvedValue(selectionsResponse([]));
    globalThis.fetch = fetchMock;

    await new OpenAiUsdaMatchSelector().selectMatches(threeSets, STEAKHOUSE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const prompt = promptBody(fetchMock);
    expect(prompt).toContain("grilled steak");
    expect(prompt).toContain("dark sauce");
    expect(prompt).toContain("mashed potatoes");
    expect(prompt).not.toContain("input_image");
    expect(JSON.parse(init.body).store).toBe(false);
  });

  it("skips the OpenAI call when no candidate choices require selection", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const verifiedOnly = [
      set("grilled steak", [], { fdcId: 777, description: "Beef, steak, cooked, grilled" }),
      set("rice", []), // no candidates: nothing to select
    ];

    const result = await new OpenAiUsdaMatchSelector().selectMatches(verifiedOnly, STEAKHOUSE);

    expect(result).toEqual({ status: "skipped", selections: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends verified-mapping ingredients to the model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(selectionsResponse([
      { ingredient: "dark sauce", fdcId: 999003, rationale: "beef gravy fits a steak dinner" },
    ]));
    globalThis.fetch = fetchMock;
    const mixed = [
      set("grilled steak", [], { fdcId: 777, description: "Beef, steak, cooked, grilled" }),
      STEAK_SETS[1],
    ];

    const result = await new OpenAiUsdaMatchSelector().selectMatches(mixed, STEAKHOUSE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(promptBody(fetchMock)).not.toContain("CRACKER BARREL");
    expect(promptBody(fetchMock)).not.toContain("171785");
    expect(result.selections.map((s) => s.ingredientName)).toEqual(["dark sauce"]);
  });

  it("degrades to abstentions on HTTP errors, timeouts, and malformed responses", async () => {
    const selector = new OpenAiUsdaMatchSelector();

    globalThis.fetch = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const httpError = await selector.selectMatches(STEAK_SETS, STEAKHOUSE);
    expect(httpError.status).toBe("failed");
    expect(httpError.selections.map((s) => s.fdcId)).toEqual([null, null]);

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("The operation was aborted"));
    const timeout = await selector.selectMatches(STEAK_SETS, STEAKHOUSE);
    expect(timeout.status).toBe("failed");

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }],
    }), { status: 200 }));
    const malformed = await selector.selectMatches(STEAK_SETS, STEAKHOUSE);
    expect(malformed.status).toBe("failed");
    expect(malformed.selections.map((s) => s.fdcId)).toEqual([null, null]);
  });

  it("fails gracefully without an API key, without calling fetch", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const result = await new OpenAiUsdaMatchSelector().selectMatches(STEAK_SETS, STEAKHOUSE);

    expect(result.status).toBe("failed");
    expect(result.selections.map((s) => s.fdcId)).toEqual([null, null]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("selectionRequired / validateAiMatchSelections", () => {
  it("evaluates only unverified sets with candidates, deduplicated by normalized name", () => {
    const sets = [
      set("grilled steak", [[1, "Beef, steak, grilled"]]),
      set("Rice", [[2, "Rice, white, cooked"]]),
      set("rice", [[3, "Rice, brown, cooked"]]), // duplicate of "Rice"
      set("butter", [], { fdcId: 4, description: "Butter, salted" }),
      set("air", []),
    ];

    expect(selectionRequired(sets).map((s) => s.ingredientName)).toEqual(["grilled steak", "Rice"]);
  });

  it("matches model output to ingredients case-insensitively", () => {
    const selections = validateAiMatchSelections(STEAK_SETS, [
      { ingredient: "DARK SAUCE", fdcId: 999003, rationale: "gravy" },
    ]);
    expect(selections[1].fdcId).toBe(999003);
    expect(selections[0].fdcId).toBeNull();
  });
});

describe("StubUsdaMatchSelector", () => {
  it("abstains deterministically and skips when nothing requires selection", async () => {
    const stub = new StubUsdaMatchSelector();

    const completed = await stub.selectMatches(STEAK_SETS);
    expect(completed.status).toBe("completed");
    expect(completed.selections.map((s) => s.fdcId)).toEqual([null, null]);

    const skipped = await stub.selectMatches([set("butter", [], { fdcId: 4, description: "Butter, salted" })]);
    expect(skipped).toEqual({ status: "skipped", selections: [] });
  });
});
