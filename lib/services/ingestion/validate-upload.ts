export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; reason: "unsupported_type" | "too_large" | "empty_or_corrupted" };

/** Validates a photo upload client- and server-side before any processing (constitution IV). Never throws. */
export function validateUpload(file: { type: string; size: number }): UploadValidationResult {
  try {
    if (!file || file.size === 0) {
      return { ok: false, reason: "empty_or_corrupted" };
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { ok: false, reason: "unsupported_type" };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    return { ok: true };
  } catch {
    // Any unexpected error while inspecting the file is treated as corrupted input, never an unhandled exception (FR-014).
    return { ok: false, reason: "empty_or_corrupted" };
  }
}

export function uploadRejectionMessage(reason: Exclude<UploadValidationResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "unsupported_type":
      return "That file type isn't something we can peek inside — please upload a JPEG, PNG, or WebP photo.";
    case "too_large":
      return "That photo is a bit too chunky for us to digest — try a file under 15MB.";
    case "empty_or_corrupted":
      return "We couldn't open that file — it looks empty or corrupted. Please try uploading it again.";
  }
}
