/**
 * Demo user that POST /api/v1/scans associates uploads with until real auth lands
 * (see DEV_USER_ID in app/api/v1/scans/route.ts). The row must exist before the first
 * scan, otherwise mealLogEntry creation fails with a P2003 foreign-key violation on a
 * freshly migrated database.
 */
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Minimal structural interface so the seed is testable without a live database. */
export interface UserProfileSeeder {
  userProfile: {
    upsert(args: {
      where: { id: string };
      update: Record<string, never>;
      create: { id: string };
    }): Promise<unknown>;
  };
}

/**
 * Idempotent: `update: {}` leaves an existing row untouched, so re-running the seed
 * never modifies a demo profile that already exists (e.g. one that has accumulated
 * dietary restrictions or meal history).
 */
export async function seedDemoUser(prisma: UserProfileSeeder): Promise<void> {
  await prisma.userProfile.upsert({
    where: { id: DEV_USER_ID },
    update: {},
    create: { id: DEV_USER_ID },
  });
}
