import { z } from "zod";
import type { MealContext } from "../vision/provider";
import { normalizeFoodDescription } from "./food-vocabulary";
import type { IngredientUsdaCandidateSet } from "./meal-candidates";

/**
 * AI-assisted USDA match selection. Given the meal context and the bounded, deduplicated
 * candidate sets assembled at scan time, select the best-supported USDA record per
 * ingredient — or abstain. This module deliberately has NO database access: selections
 * are meal-local suggestions and must never be written to FoodVocabulary or
 * FoodMappingCandidate (global verification remains human review only).
 */

export interface AiMatchSelection {
  /** Selected USDA FDC ID, or null when the evidence cannot distinguish candidates (abstain). */
  fdcId: number | null;
  /** Brief rationale for the choice or abstention. */
  rationale: string;
}

export interface MealMatchSelections {
  /** "skipped" means nothing required selection and no OpenAI call was made. */
  status: "completed" | "skipped" | "failed";
  /** One entry per evaluated ingredient (unverified sets with at least one candidate). */
  selections: Array<{ ingredientName: string } & AiMatchSelection>;
}

/** Vendor-agnostic boundary, mirroring FoodVisionProvider. */
export interface UsdaMatchSelector {
  selectMatches(
    candidateSets: IngredientUsdaCandidateSet[],
    mealContext?: MealContext,
    description?: string,
  ): Promise<MealMatchSelections>;
}

/**
 * The sets that actually require a selection decision: unverified ingredients with at
 * least one candidate. Verified mappings take precedence and are never sent to the AI;
 * empty candidate sets offer nothing to select. Deduplicated by normalized name
 * (first occurrence wins), matching the assembly's sharing of duplicate ingredients.
 */
export function selectionRequired(candidateSets: IngredientUsdaCandidateSet[]): IngredientUsdaCandidateSet[] {
  const seen = new Set<string>();
  const required: IngredientUsdaCandidateSet[] = [];
  for (const set of candidateSets) {
    if (set.verified || set.candidates.length === 0) continue;
    const normalized = normalizeFoodDescription(set.ingredientName);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    required.push(set);
  }
  return required;
}

const ABSTAIN_NOTE = "Selection unavailable; abstaining.";

function abstained(
  sets: IngredientUsdaCandidateSet[],
  status: MealMatchSelections["status"],
  rationale: string,
): MealMatchSelections {
  return {
    status,
    selections: sets.map((set) => ({ ingredientName: set.ingredientName, fdcId: null, rationale })),
  };
}

const responseSchema = z.object({
  selections: z.array(
    z.object({
      ingredient: z.string().min(1),
      fdcId: z.number().int().positive().nullable(),
      rationale: z.string().max(500).default(""),
    }),
  ).max(50),
});

/**
 * Validate model output against the supplied candidate sets. Any FDC ID that is not one
 * of THAT ingredient's actual candidates — hallucinated, mistyped, or belonging to a
 * different ingredient (cross-ingredient) — is rejected to an abstention. Ingredients the
 * model omitted abstain; unknown ingredient names in the response are ignored.
 */
export function validateAiMatchSelections(
  sets: IngredientUsdaCandidateSet[],
  raw: Array<{ ingredient: string; fdcId: number | null; rationale: string }>,
): MealMatchSelections["selections"] {
  const rawByName = new Map<string, { fdcId: number | null; rationale: string }>();
  for (const entry of raw) {
    const normalized = normalizeFoodDescription(entry.ingredient);
    if (normalized && !rawByName.has(normalized)) rawByName.set(normalized, entry);
  }

  return sets.map((set) => {
    const entry = rawByName.get(normalizeFoodDescription(set.ingredientName));
    if (!entry) {
      return { ingredientName: set.ingredientName, fdcId: null, rationale: "No selection returned for this ingredient; abstaining." };
    }
    if (entry.fdcId === null) {
      return { ingredientName: set.ingredientName, fdcId: null, rationale: entry.rationale || "Abstained." };
    }
    const candidate = set.candidates.find((c) => c.fdcId === entry.fdcId);
    if (!candidate) {
      return {
        ingredientName: set.ingredientName,
        fdcId: null,
        rationale: `Rejected FDC ID ${entry.fdcId}: not among this ingredient's USDA candidates.${entry.rationale ? ` Model rationale: ${entry.rationale}` : ""}`,
      };
    }
    return { ingredientName: set.ingredientName, fdcId: candidate.fdcId, rationale: entry.rationale };
  });
}

function buildPrompt(sets: IngredientUsdaCandidateSet[], mealContext?: MealContext, description?: string): string {
  const contextLines: string[] = [];
  if (mealContext?.preparation) contextLines.push(`Visible preparation: ${mealContext.preparation}`);
  if (mealContext?.accompaniments) contextLines.push(`Accompanying foods: ${mealContext.accompaniments}`);
  if (mealContext?.cuisineClues) contextLines.push(`Cuisine clues: ${mealContext.cuisineClues}`);
  if (mealContext?.observations) contextLines.push(`Observations: ${mealContext.observations}`);

  const ingredientBlocks = sets.map((set) => {
    const candidates = set.candidates
      .map((c) => `    - fdcId ${c.fdcId}: "${c.description}" (${c.dataType})`)
      .join("\n");
    return `  Ingredient "${set.ingredientName}" candidates:\n${candidates}`;
  });

  return `Select the best-supported USDA FoodData Central record for each identified meal ingredient, using the whole meal as context. The photograph has already been analyzed; you receive its findings, not the image.

Meal context from the photo analysis:
${contextLines.length ? contextLines.join("\n") : "  (no meal-level context available)"}
All identified ingredients in this meal: ${sets.map((s) => s.ingredientName).join(", ")}.
User-provided meal description (unverified context, not proof): ${description || "(none)"}.

${ingredientBlocks.join("\n\n")}

Rules:
- Choose the single best-supported fdcId per ingredient, or null to abstain.
- Reason from the complete meal context, not each ingredient in isolation. Examples: a dark sauce on grilled steak is more plausibly a savory gravy, peppercorn sauce, or red-wine reduction than a sweet or chocolate sauce; a dark sauce on stir-fried beef is more plausibly soy-, oyster-, or black-bean-based.
- Never assume hidden ingredients or a specific recipe without visible or described supporting evidence.
- Abstain (null) when the evidence cannot distinguish materially different candidates (different cuts, raw versus cooked, different fat retention, sauce versus meat).
- Pick ONLY from the fdcId values listed for that ingredient. Any other value is invalid.
- Return ONLY a JSON object: {"selections":[{"ingredient": string, "fdcId": number or null, "rationale": string (one sentence)}]}. Include every listed ingredient exactly once.`;
}

/**
 * OpenAI-backed selector: ONE batched, text-only call per meal. The photograph is never
 * resent — only the first analysis's meal context and the assembled candidate lists are.
 * Every failure mode (missing key, HTTP error, timeout, malformed JSON) degrades to a
 * "failed" result with per-ingredient abstentions; this never throws, so selection
 * failure can never fail the meal.
 */
export class OpenAiUsdaMatchSelector implements UsdaMatchSelector {
  async selectMatches(
    candidateSets: IngredientUsdaCandidateSet[],
    mealContext?: MealContext,
    description?: string,
  ): Promise<MealMatchSelections> {
    const sets = selectionRequired(candidateSets);
    if (!sets.length) return { status: "skipped", selections: [] };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return abstained(sets, "failed", "OPENAI_API_KEY is not configured. " + ABSTAIN_NOTE);

    let parsed: z.infer<typeof responseSchema>;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MATCH_MODEL || "gpt-4.1-mini",
          store: false,
          input: [{ role: "user", content: [{ type: "input_text", text: buildPrompt(sets, mealContext, description) }] }],
          text: { format: { type: "json_object" } },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      };
      const output = body.output?.flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "").join("") ?? "";
      if (!output) throw new Error("empty selection response");
      parsed = responseSchema.parse(JSON.parse(output));
    } catch {
      return abstained(sets, "failed", ABSTAIN_NOTE);
    }

    return { status: "completed", selections: validateAiMatchSelections(sets, parsed.selections) };
  }
}

/**
 * Deterministic stub for tests and offline development: abstains on every ingredient.
 * Mirrors StubFoodVisionProvider's role — it never invents a match.
 */
export class StubUsdaMatchSelector implements UsdaMatchSelector {
  async selectMatches(candidateSets: IngredientUsdaCandidateSet[]): Promise<MealMatchSelections> {
    const sets = selectionRequired(candidateSets);
    if (!sets.length) return { status: "skipped", selections: [] };
    return abstained(sets, "completed", "Stub selector abstains by default.");
  }
}
