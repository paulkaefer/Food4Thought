import type { VisionResult } from "@/lib/services/vision/provider";

/** Distinct, testable quality-check stage that must run before content classification (domain gate). */
export function checkImageQuality(vision: VisionResult): { passesQuality: boolean } {
  return { passesQuality: !vision.isLowQuality };
}
