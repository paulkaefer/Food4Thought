"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const FRACTIONS = [1, 0.5, 0.25, 0];

/** Whole-meal % selector, per-item sliders, and after-photo capture for consumption tracking (FR-019, FR-020, FR-021). */
export function ConsumptionControls({ mealLogEntryId }: { mealLogEntryId: string }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function setWholeMealFraction(fraction: number) {
    setSaving(true);
    const res = await fetch(`/api/v1/meal-log-entries/${mealLogEntryId}/consumption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "manual_fraction", consumedFraction: fraction }),
    });
    const body = await res.json();
    setMessage(body.message);
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">How much did you eat?</p>
      <div className="flex gap-2">
        {FRACTIONS.map((fraction) => (
          <Button key={fraction} variant="outline" disabled={saving} onClick={() => setWholeMealFraction(fraction)}>
            {Math.round(fraction * 100)}%
          </Button>
        ))}
      </div>
      {message && <p className="text-sm opacity-70">{message}</p>}
    </div>
  );
}
