/**
 * Prisma Client singleton.
 *
 * Why a singleton? In Next.js dev mode, modules are reloaded on every file
 * change. Calling `new PrismaClient()` each time would open dozens of database
 * connections and trigger "too many connections" warnings. So we stash the
 * instance on `globalThis` and reuse it.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Seeing the SQL that actually runs is useful while learning.
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
