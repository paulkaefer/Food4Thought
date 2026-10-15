/** Provider-neutral, server-side photo storage contract. IDs are never public URLs. */
export interface StoredPhoto {
  id: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
}
export interface PhotoStorage {
  save(file: Blob): Promise<string>;
  read(id: string): Promise<StoredPhoto>;
  delete(id: string): Promise<void>;
}
