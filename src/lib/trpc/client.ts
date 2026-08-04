/**
 * tRPC İSTEMCİSİ (React hook'ları)
 *
 * `createTRPCReact<AppRouter>()` sunucu router'ının tipinden, React Query
 * tabanlı hook'lardan oluşan bir nesne üretir:
 *
 *   trpc.todo.list.useQuery()
 *   trpc.todo.create.useMutation()
 *   trpc.useUtils()   → cache'e müdahale etmek için (invalidate, setData...)
 *
 * DİKKAT: `import type` kullanıyoruz. Sadece TİP import ediliyor, sunucu kodu
 * (Prisma, veritabanı bağlantısı vb.) tarayıcı bundle'ına GİRMİYOR.
 */

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "~/server/trpc/root";

export const trpc = createTRPCReact<AppRouter>();
