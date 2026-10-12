import { PrismaClient } from "@prisma/client";
import { DEV_USER_ID, seedDemoUser } from "../lib/seed-demo-user";

/**
 * `npm run db:seed` — creates the demo UserProfile required by POST /api/v1/scans.
 * Idempotent: safe to re-run; an existing record is left untouched.
 */

/**
 * Standalone runs don't get Next.js/Prisma CLI env loading, so load env files here.
 * `.env.local` loads first and wins over `.env` (files never override shell-set
 * variables), matching the `next dev` precedence.
 */
function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedDemoUser(prisma);
    console.info(`[seed] demo user profile ready (id=${DEV_USER_ID})`);
  } finally {
    await prisma.$disconnect();
  }
}

loadEnvFiles();
main().catch((error) => {
  console.error("[seed] failed:", error);
  process.exit(1);
});
