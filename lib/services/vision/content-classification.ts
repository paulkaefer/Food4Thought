import type { ContentClassification, VisionResult } from "@/lib/services/vision/provider";

/** Distinct, testable content-classification stage (food vs. non-food vs. empty-plate), separate from quality-check and identification (domain gate). */
export function classifyContent(vision: VisionResult): ContentClassification {
  return vision.contentClassification;
}
