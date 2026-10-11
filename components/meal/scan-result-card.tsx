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
}

/** Renders per-item and combined-total results, plus every rejected/approximate/fun-estimate state via the shared envelope. */
export function ScanResultCard({ result, foodItems }: { result: ApiEnvelope; foodItems?: FoodItemView[] }) {
  const mealId = (result.data as { mealLogEntry?: { id: string } } | undefined)?.mealLogEntry?.id;
  const [corrections, setCorrections] = useState<Record<string, string>>({});
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

  async function confirm(item: FoodItemView) {
    if (!mealId || !(corrections[item.id] ?? item.name).trim()) return;
    setSaving(item.id);
    try {
      const response = await fetch(`/api/v1/meal-log-entries/${mealId}/food-items/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedName: (corrections[item.id] ?? item.name).trim() }),
      });
      const body = await response.json();
      if (!response.ok || !body.data?.foodItem) throw new Error(body.message || "Could not update ingredient.");
      setUpdatedItems((old) => ({ ...old, [item.id]: { ...item, ...body.data.foodItem } }));
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
      {result.status !== "needs_confirmation" && <ScanResultEnvelope result={result} />}
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
              {Math.round(mealTotal.calories)} kcal · {Math.round(mealTotal.proteinG)}g protein ·{" "}
              {Math.round(mealTotal.carbsG)}g carbs · {Math.round(mealTotal.fatG)}g fat
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
                {Math.round(item.calories)} kcal · {Math.round(item.proteinG)}g protein · {Math.round(item.carbsG)}g
                carbs · {Math.round(item.fatG)}g fat
              </p>
            )}
            {item.uncertaintyReason && !isNutritionUnavailable(item) && (
              <p className="opacity-70">{item.uncertaintyReason}</p>
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
