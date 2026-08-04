/**
 * Prisma Client singleton'ı.
 *
 * Neden singleton? Next.js dev modunda her dosya değişikliğinde modüller
 * yeniden yüklenir. Her seferinde `new PrismaClient()` çağırsaydık onlarca
 * veritabanı bağlantısı açılır ve "too many connections" uyarısı alırdık.
 * Bu yüzden instance'ı `globalThis` üzerinde saklayıp tekrar kullanıyoruz.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Dev'de çalışan SQL sorgularını konsolda görmek öğrenirken faydalı.
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
