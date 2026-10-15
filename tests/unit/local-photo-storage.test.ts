import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalPhotoStorage } from "@/lib/services/ingestion/local-photo-storage";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LocalPhotoStorage", () => {
  it("saves, reads, and deletes a private photo by opaque ID", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "food4thought-"));
    directories.push(dir);
    const storage = new LocalPhotoStorage(dir);
    const id = await storage.save(new Blob(["sample image bytes"], { type: "image/jpeg" }));
    expect(id).toMatch(/^[0-9a-f-]+\.jpg$/);
    const photo = await storage.read(id);
    expect(photo.contentType).toBe("image/jpeg");
    expect(photo.bytes.toString()).toBe("sample image bytes");
    await storage.delete(id);
    await expect(storage.read(id)).rejects.toThrow();
  });

  it("rejects traversal and unsupported files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "food4thought-"));
    directories.push(dir);
    const storage = new LocalPhotoStorage(dir);
    await expect(storage.read("../secrets.jpg")).rejects.toThrow("Invalid photo identifier");
    await expect(storage.delete("https://example.com/photo.jpg")).rejects.toThrow("Invalid photo identifier");
    await expect(storage.save(new Blob(["x"], { type: "text/plain" }))).rejects.toThrow("Unsupported photo type");
  });

  it("rejects storage under the public directory", () => {
    expect(() => new LocalPhotoStorage(path.join(process.cwd(), "public", "photos"))).toThrow();
  });
});
