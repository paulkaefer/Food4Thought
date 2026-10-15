import { describe, expect, it, vi } from "vitest";
import { DEV_USER_ID, seedDemoUser, type UserProfileSeeder } from "@/lib/seed-demo-user";

describe("db:seed — demo user initialization", () => {
  it("upserts the DEV_USER_ID profile and never modifies an existing record", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: DEV_USER_ID });
    const prisma: UserProfileSeeder = { userProfile: { upsert } };

    await seedDemoUser(prisma);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: DEV_USER_ID },
      update: {}, // empty update: an existing profile (with restrictions/history) is left untouched
      create: { id: DEV_USER_ID },
    });
  });

  it("is repeatable: a second run performs the same idempotent upsert and keeps exactly one record", async () => {
    // Emulate Prisma upsert semantics against a tiny in-memory store.
    const store = new Map<string, { id: string }>();
    const upsert = vi.fn(
      async (args: { where: { id: string }; update: Record<string, never>; create: { id: string } }) => {
        const existing = store.get(args.where.id);
        if (existing) return { ...existing, ...args.update };
        const created = { ...args.create };
        store.set(created.id, created);
        return created;
      },
    );
    const prisma: UserProfileSeeder = { userProfile: { upsert } };

    await seedDemoUser(prisma);
    await seedDemoUser(prisma);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toEqual(upsert.mock.calls[1][0]);
    expect(store.size).toBe(1);
    expect(store.get(DEV_USER_ID)).toEqual({ id: DEV_USER_ID });
  });
});
