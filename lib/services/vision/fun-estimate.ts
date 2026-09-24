import type { FunEstimate } from "@/lib/api/envelope";

const FUN_NOTES = [
  "We're pretty sure that's not edible, but if it were, it might pack a whopping",
  "Not food, but hey — hypothetically, if you *did* eat it, that'd be about",
  "This isn't on any nutrition label we know of, but for laughs, let's say it's",
];

/** Generates a clearly-labeled, non-real estimate for non-food images (FR-007). Never included in real totals. */
export function generateFunEstimate(seedText: string): FunEstimate {
  const note = FUN_NOTES[seedText.length % FUN_NOTES.length];
  // Deterministic "silly" calorie count derived from the seed, purely for entertainment.
  const calories = 100 + (seedText.length * 37) % 900;
  return {
    label: "just for fun",
    calories,
    note: `${note} ${calories} calories. 😄 (Not real nutrition data — just for fun!)`,
  };
}
