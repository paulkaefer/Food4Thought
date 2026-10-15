import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PhotoStorage, StoredPhoto } from "./storage-interface";

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
type SupportedType = keyof typeof EXTENSIONS;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;
const MIME_BY_EXTENSION: Record<string, StoredPhoto["contentType"]> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp",
};

export class LocalPhotoStorage implements PhotoStorage {
  private readonly root: string;

  constructor(root = process.env.PHOTO_STORAGE_DIR) {
    if (!root) throw new Error("PHOTO_STORAGE_DIR must be configured");
    this.root = path.resolve(root);
    const publicDir = path.resolve(process.cwd(), "public");
    if (this.root === publicDir || this.root.startsWith(publicDir + path.sep)) {
      throw new Error("Photo storage cannot be inside the public directory");
    }
  }

  private location(id: string): string {
    if (!ID_PATTERN.test(id)) throw new Error("Invalid photo identifier");
    return path.join(this.root, id);
  }

  async save(file: Blob): Promise<string> {
    if (!(file.type in EXTENSIONS)) throw new Error("Unsupported photo type");
    if (file.size === 0 || file.size > 2 * 1024 * 1024) throw new Error("Invalid photo size");
    const id = `${randomUUID()}.${EXTENSIONS[file.type as SupportedType]}`;
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await writeFile(this.location(id), Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
    return id;
  }

  async read(id: string): Promise<StoredPhoto> {
    const extension = id.split(".").pop()!;
    const bytes = await readFile(this.location(id));
    return { id, bytes, contentType: MIME_BY_EXTENSION[extension] };
  }

  async delete(id: string): Promise<void> {
    await unlink(this.location(id));
  }
}
