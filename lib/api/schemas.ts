import { z } from "zod";

export const scanRequestSchema = z.object({
  mode: z.enum(["before", "after", "single"]).default("single"),
  linkedMealLogEntryId: z.string().uuid().optional(),
});

export const confirmFoodItemSchema = z.object({
  confirmedName: z.string().min(1, "confirmedName is required"),
  resolveConflicts: z.array(z.string().uuid()).default([]),
});

export const manualConsumptionSchema = z.object({
  method: z.literal("manual_fraction"),
  consumedFraction: z.number().min(0).max(1),
});

export const perItemConsumptionSchema = z.object({
  method: z.literal("per_item"),
  items: z
    .array(
      z.object({
        foodItemId: z.string().uuid(),
        consumedFraction: z.number().min(0).max(1),
      }),
    )
    .min(1),
});

export const consumptionRequestSchema = z.discriminatedUnion("method", [
  manualConsumptionSchema,
  perItemConsumptionSchema,
]);

export const dietaryRestrictionTypeSchema = z.enum([
  "gluten_free",
  "vegetarian",
  "vegan",
  "nut_allergy",
  "shellfish_allergy",
  "avoid_pork",
]);

export const putDietaryRestrictionsSchema = z.object({
  restrictions: z.array(dietaryRestrictionTypeSchema),
});
