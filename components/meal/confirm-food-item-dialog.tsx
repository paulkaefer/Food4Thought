"use client";

import { useState } from "react";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmFoodItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealLogEntryId: string;
  foodItemId: string;
  suggestedName: string;
  confidence: number;
  onConfirmed: () => void;
}

/** Lets the user confirm or correct an identification before it counts toward totals (FR-013, FR-027). */
export function ConfirmFoodItemDialog({
  open,
  onOpenChange,
  mealLogEntryId,
  foodItemId,
  suggestedName,
  confidence,
  onConfirmed,
}: ConfirmFoodItemDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    await fetch(`/api/v1/meal-log-entries/${mealLogEntryId}/food-items/${foodItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmedName: name, resolveConflicts: [] }),
    });
    setSubmitting(false);
    onConfirmed();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Is this right?</DialogTitle>
      </DialogHeader>
      <p className="text-sm opacity-80">
        We're only {Math.round(confidence * 100)}% sure — mind confirming or correcting the name?
      </p>
      <input
        className="mt-3 w-full rounded-md border border-border p-2 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={submitting}>
          Confirm
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
