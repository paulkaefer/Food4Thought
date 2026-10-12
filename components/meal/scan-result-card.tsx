"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanResultEnvelope } from "./scan-result-envelope";
import type { ApiEnvelope } from "@/lib/api/envelope";
import {
  hasIncompleteTotals,
  isNutritionUnavailable,
  sumNutritionEstimates,
  type NutritionEstimate,
} from "@/lib/models/nutrition-estimate";
import { conciseUsdaOptionLabels, usdaMatchDisplayLabel } from "@/lib/usda-display";

interface UsdaCandidateView {
  fdcId: number;
  description: string;
  dataType: string;
}

interface FoodItemView {
  id: string;
  name: string;
  identificationStatus: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutritionIsApproximate: boolean;
  uncertaintyReason: string | null;
  dataSource: string;
  allergenLabels: { allergen: string }[];
  usdaFdcId?: number | null;
  usdaDescription?: string | null;
  usdaMatchSource?: string | null;
  usdaCandidates?: UsdaCandidateView[] | null;
}

/** Renders per-item and combined-total results, plus every rejected/approximate/fun-estimate state via the shared envelope. */
export function ScanResultCard({ result, foodItems }: { result: ApiEnvelope; foodItems?: FoodItemView[] }) {
  const mealId = (result.data as { mealLogEntry?: { id: string } } | undefined)?.mealLogEntry?.id;
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [matchChoice, setMatchChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [updatedItems, setUpdatedItems] = useState<Record<string, FoodItemView>>({});

  // Totals derive from the currently displayed items, so a confirmed correction
  // (which replaces the item in updatedItems) recalculates them immediately.
  const displayedItems = (foodItems ?? []).map((original) => updatedItems[original.id] ?? original);
  const itemEstimates: NutritionEstimate[] = displayedItems.map((item) => ({
    calories: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
    micronutrients: {},
    isApproximate: item.nutritionIsApproximate,
    uncertaintyReason: item.uncertaintyReason,
  }));
  const mealTotal = displayedItems.length > 0 ? sumNutritionEstimates(itemEstimates) : null;
  const totalsIncomplete = hasIncompleteTotals(itemEstimates);

  async function confirm(item: FoodItemView, usdaFdcId?: number) {
    if (!mealId || !(corrections[item.id] ?? item.name).trim()) return;
    setSaving(item.id);
    try {
      const response = await fetch(`/api/v1/meal-log-entries/${mealId}/food-items/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmedName: (corrections[item.id] ?? item.name).trim(),
          ...(usdaFdcId !== undefined ? { usdaFdcId } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.data?.foodItem) throw new Error(body.message || "Could not update ingredient.");
      setUpdatedItems((old) => ({ ...old, [item.id]: { ...item, ...body.data.foodItem } }));
      // The applied match now lives on the item itself; drop the pending dropdown choice so
      // the control returns to its placeholder instead of disagreeing with the applied match.
      setMatchChoice((old) => ({ ...old, [item.id]: "" }));
      setConfirmed((old) => [...old, item.id]);
      setErrors((old) => ({ ...old, [item.id]: "" }));
    } catch (error) {
      setErrors((old) => ({ ...old, [item.id]: error instanceof Error ? error.message : "Update failed." }));
    } finally { setSaving(null); }
  }
  return (
    <div className="space-y-4">
      {/* The top-level needs_confirmation ("lookalike") banner is intentionally not rendered:
          the per-item correction controls carry that flow without an extra alert. */}
      {/* A "processing" envelope is progress, not a result: the polling UI owns that state,
          so the shared banner never shows the "hang tight" copy as a final result (this also
          keeps legacy stuck-processing rows quiet on the meal detail page). */}
      {result.status !== "needs_confirmation" && result.status !== "processing" && (
        <ScanResultEnvelope result={result} />
      )}
      {mealTotal && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Meal totals</CardTitle>
            <div className="flex gap-1">
              {mealTotal.isApproximate && <Badge variant="warning">approximate</Badge>}
              {totalsIncomplete && <Badge variant="destructive">incomplete</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-lg font-semibold">
              {Math.round(mealTotal.calories)} Calories · {Math.round(mealTotal.proteinG)}g Protein ·{" "}
              {Math.round(mealTotal.carbsG)}g Carbs · {Math.round(mealTotal.fatG)}g Fat
            </p>
            {totalsIncomplete ? (
              <p className="text-sm opacity-70">
                Some ingredients have unavailable nutrition — totals include only items with data and may be
                lower than the actual meal.
              </p>
            ) : (
              mealTotal.uncertaintyReason && <p className="text-sm opacity-70">{mealTotal.uncertaintyReason}</p>
            )}
          </CardContent>
        </Card>
      )}
      {foodItems?.map((original) => {
        const item = updatedItems[original.id] ?? original;
        const matchOptions = conciseUsdaOptionLabels(item.usdaCandidates ?? []);
        const chosenOption = matchOptions.find((option) => String(option.fdcId) === (matchChoice[item.id] ?? ""));
        return <Card key={item.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{item.name}</CardTitle>
            <div className="flex gap-1">
              {item.nutritionIsApproximate && <Badge variant="warning">approximate</Badge>}
              <Badge>{item.dataSource.replace("_", " ")}</Badge>
              {item.allergenLabels.map((a) => (
                <Badge key={a.allergen} variant="destructive">
                  {a.allergen.replace("_", " ")}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {isNutritionUnavailable(item) ? (
              <p role="status">Nutrition unavailable — no verified or approximate match for this ingredient.</p>
            ) : (
              <p>
                {Math.round(item.calories)} Calories · {Math.round(item.proteinG)}g Protein · {Math.round(item.carbsG)}g
                Carbs · {Math.round(item.fatG)}g Fat
              </p>
            )}
            {item.uncertaintyReason && !isNutritionUnavailable(item) && (
              <p className="opacity-70">{item.uncertaintyReason}</p>
            )}
            {item.usdaDescription && (
              <p className="opacity-70" title={`${item.usdaDescription}${item.usdaFdcId ? ` (FDC ${item.usdaFdcId})` : ""}`}>
                USDA match: {usdaMatchDisplayLabel(item.name, item.usdaDescription)}
                {item.usdaMatchSource === "ai_selected" && " (AI-selected)"}
                {item.usdaMatchSource === "user_selected" && " (your choice)"}
                {item.usdaMatchSource === "verified_mapping" && " (verified mapping)"}
              </p>
            )}
            {matchOptions.length > 0 && (
              <div className="space-y-1 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`match-${item.id}`} className="font-medium">Change USDA match</label>
                  <select
                    id={`match-${item.id}`}
                    className="max-w-full rounded-md border p-2"
                    value={matchChoice[item.id] ?? ""}
                    onChange={(event) => setMatchChoice((old) => ({ ...old, [item.id]: event.target.value }))}
                  >
                    <option value="" disabled>Choose a USDA record…</option>
                    {matchOptions.map((option) => (
                      <option key={option.fdcId} value={option.fdcId}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={saving === item.id || !matchChoice[item.id]}
                    onClick={() => void confirm(item, Number(matchChoice[item.id]))}
                    className="rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-50"
                  >
                    {saving === item.id ? "Saving..." : "Apply match"}
                  </button>
                </div>
                {/* Accessible detail mechanism (not a title tooltip): the complete record is
                    shown as real text as soon as an option is chosen, before applying. */}
                {chosenOption && (
                  <p className="text-xs opacity-70">{chosenOption.detail}</p>
                )}
                {/* Pending vs applied: a dropdown choice is only a proposal until applied —
                    the nutrition above always reflects the applied match. */}
                {matchChoice[item.id] && (
                  <p className="text-xs text-amber-700">
                    Pending selection — nutrition above still reflects the applied match. Choose Apply match to
                    recalculate.
                  </p>
                )}
                {/* Apply failures surface here too (not only in the rename flow below), so a
                    rejected match never looks like it was saved. */}
                {errors[item.id] && (
                  <p role="alert" className="text-red-700">
                    {errors[item.id]}
                  </p>
                )}
              </div>
            )}
            {item.identificationStatus === "pending_user_confirmation" && !confirmed.includes(item.id) && (
              <div className="space-y-2 pt-2">
                <label htmlFor={`correct-${item.id}`} className="block font-medium">What is this ingredient?</label>
                <input id={`correct-${item.id}`} className="w-full rounded-md border p-2" placeholder="Correct ingredient name" value={corrections[item.id] ?? item.name} onChange={(event) => setCorrections((old) => ({ ...old, [item.id]: event.target.value }))} />
                <button type="button" disabled={saving === item.id} onClick={() => void confirm({ ...item, name: corrections[item.id] ?? item.name })} className="rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-50">{saving === item.id ? "Saving..." : "Confirm ingredient"}</button>
                {errors[item.id] && <p role="alert" className="text-red-700">{errors[item.id]}</p>}
              </div>
            )}
            {confirmed.includes(item.id) && <p className="text-green-700">Ingredient confirmed and nutrition recalculated.</p>}
          </CardContent>
        </Card>;
      })}
    </div>
  );
}
