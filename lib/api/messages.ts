import type { MealLogStatus } from "./envelope";

/** Shared friendly/playful copy for each pipeline outcome, reused by both API responses and UI (constitution III). */
export const STATUS_MESSAGES: Record<MealLogStatus, string> = {
  processing: "Scanning your plate... hang tight!",
  identified: "Nom nom — here's what we found!",
  needs_confirmation: "This one's a bit of a lookalike — mind confirming what it actually is?",
  rejected_non_food: "That doesn't look like food to us — but we still had fun looking!",
  rejected_low_quality: "This photo is a little camera-shy 🙈 — could you retake it somewhere brighter or steadier?",
  rejected_invalid_file: "We couldn't open that file — please upload a clear JPEG, PNG, or WebP photo.",
  empty_plate: "Looks like a squeaky-clean plate — 0 calories, nice work!",
};

export function messageFor(status: MealLogStatus): string {
  return STATUS_MESSAGES[status];
}
