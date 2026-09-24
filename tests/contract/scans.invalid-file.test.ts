import { describe, expect, it } from "vitest";
import { validateUpload } from "@/lib/services/ingestion/validate-upload";

describe("POST /api/v1/scans — invalid file type / corrupted image", () => {
  it("rejects a PDF as unsupported type", () => {
    const result = validateUpload({ type: "application/pdf", size: 1024 });
    expect(result).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("rejects a zero-byte (corrupted) file", () => {
    const result = validateUpload({ type: "image/jpeg", size: 0 });
    expect(result).toEqual({ ok: false, reason: "empty_or_corrupted" });
  });

  it("rejects an oversized file", () => {
    const result = validateUpload({ type: "image/jpeg", size: 999_999_999 });
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("never throws on malformed input", () => {
    // @ts-expect-error intentionally malformed input to verify no unhandled exception (FR-014)
    expect(() => validateUpload(null)).not.toThrow();
  });
});
