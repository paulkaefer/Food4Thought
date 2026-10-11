import { z } from "zod";
import { LocalPhotoStorage } from "@/lib/services/ingestion/local-photo-storage";
import type { FoodVisionProvider, VisionResult } from "./provider";
import { VisionProviderError } from "./provider";
import { approximatePortion, unreliablePortion } from "@/lib/models/portion-estimate";

const candidateSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  portionMinGrams: z.number().positive().nullable(),
  portionMaxGrams: z.number().positive().nullable(),
  hasAmbiguousAlternative: z.boolean(),
  hasHiddenIngredients: z.boolean(),
});
const resultSchema = z.object({
  contentClassification: z.enum(["food", "non_food", "empty_plate"]),
  isLowQuality: z.boolean(),
  foodCandidates: z.array(candidateSchema).max(20),
});

/** Real vision adapter. Receives an opaque private photo ID, never a public URL. */
export class OpenAiFoodVisionProvider implements FoodVisionProvider {
  async analyze(photoId: string, description?: string): Promise<VisionResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new VisionProviderError("OPENAI_API_KEY is not configured");
    const photo = await new LocalPhotoStorage().read(photoId);
    const imageUrl = `data:${photo.contentType};base64,${photo.bytes.toString("base64")}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        store: false,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: `Analyze this food photograph. Return ONLY a JSON object with keys:
contentClassification ("food", "non_food", or "empty_plate"), isLowQuality (boolean), foodCandidates (array).
For each candidate include name (string), confidence (number 0 to 1), portionMinGrams (positive number or null), portionMaxGrams (positive number or null), hasAmbiguousAlternative (boolean), hasHiddenIngredients (boolean).
Identify distinct visible foods. Do not invent unseen ingredients. If uncertain, use lower confidence, mark hidden ingredients, or leave portions null. Portion ranges must reflect only what is visually plausible, not a standard serving. Return an empty array for non-food, empty plate, or unusably poor images. Never claim precise nutrition from the photo.\nUser-provided meal description (unverified context, not proof): ${description || "(none)"}. Use it to interpret ambiguous visible ingredients, but do not invent unseen ingredients or override contradictory visual evidence.` },
            { type: "input_image", image_url: imageUrl, detail: "high" },
          ],
        }],
        text: { format: { type: "json_object" } },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new VisionProviderError(`OpenAI vision request failed (HTTP ${response.status})`);
    const body = await response.json() as {
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    };
    const output = body.output?.flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "").join("") ?? "";
    if (!output) throw new VisionProviderError("OpenAI returned no vision analysis");
    let parsed: z.infer<typeof resultSchema>;
    try {
      parsed = resultSchema.parse(JSON.parse(output));
    } catch (error) {
      throw new VisionProviderError("OpenAI returned invalid food analysis", { cause: error });
    }
    return {
      contentClassification: parsed.contentClassification,
      isLowQuality: parsed.isLowQuality,
      foodCandidates: parsed.foodCandidates.map((candidate) => ({
        name: candidate.name,
        confidence: candidate.confidence,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        portionEstimate:
          candidate.portionMinGrams !== null &&
          candidate.portionMaxGrams !== null &&
          candidate.portionMaxGrams >= candidate.portionMinGrams
            ? approximatePortion(candidate.portionMinGrams, candidate.portionMaxGrams)
            : unreliablePortion(),
        hasAmbiguousAlternative: candidate.hasAmbiguousAlternative,
        hasHiddenIngredients: candidate.hasHiddenIngredients,
      })),
    };
  }
}
