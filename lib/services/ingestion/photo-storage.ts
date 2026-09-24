import { put } from "@vercel/blob";

export interface PhotoStorageResult {
  url: string;
}

/** Thin wrapper around Vercel Blob so callers never touch the SDK directly and every failure is handled explicitly (constitution I). */
export async function storePhoto(
  file: Blob,
  pathHint: string,
): Promise<PhotoStorageResult> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
    }
    const blob = await put(pathHint, file, { access: "public", token });
    return { url: blob.url };
  } catch (error) {
    throw new PhotoStorageError("Failed to store the uploaded photo", { cause: error });
  }
}

export class PhotoStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "PhotoStorageError";
    this.cause = options?.cause;
  }
}
