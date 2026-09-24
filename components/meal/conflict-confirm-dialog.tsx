"use client";

import { useState } from "react";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConflictConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealLogEntryId: string;
  foodItemId: string;
  conflictFlagIds: string[];
  restrictionType: string;
  reason: "conflict_detected" | "cannot_verify";
  onResolved: () => void;
}

/** Requires the user to confirm ingredients before a flagged item counts toward logged/consumed totals (FR-018). */
export function ConflictConfirmDialog({
  open,
  onOpenChange,
  mealLogEntryId,
  foodItemId,
  conflictFlagIds,
  restrictionType,
  reason,
  onResolved,
}: ConflictConfirmDialogProps) {
  const [confirmedName, setConfirmedName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    await fetch(`/api/v1/meal-log-entries/${mealLogEntryId}/food-items/${foodItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmedName: confirmedName || undefined, resolveConflicts: conflictFlagIds }),
    });
    setSubmitting(false);
    onResolved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Quick check: does this fit your {restrictionType.replace("_", " ")} restriction?</DialogTitle>
      </DialogHeader>
      <p className="text-sm opacity-80">
        {reason === "conflict_detected"
          ? "This looks like it conflicts with a restriction you've set — please confirm before we log it."
          : "We can't tell from the photo alone — a photo isn't proof of compliance. Please confirm the ingredients."}
      </p>
      <input
        className="mt-3 w-full rounded-md border border-border p-2 text-sm"
        placeholder="Optional: correct the food name"
        value={confirmedName}
        onChange={(e) => setConfirmedName(e.target.value)}
      />
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Not yet
        </Button>
        <Button onClick={handleConfirm} disabled={submitting}>
          Confirm ingredients
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
