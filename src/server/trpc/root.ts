/**
 * KÖK ROUTER (root / app router)
 *
 * Tüm alt router'ları tek bir ağaçta birleştirir. Buraya eklediğin her isim
 * istemcide bir "namespace" olur:
 *
 *   todoRouter.create  →  trpc.todo.create.useMutation()
 *   todoRouter.list    →  trpc.todo.list.useQuery()
 *
 * İleride `user: userRouter` eklersen istemcide `trpc.user.*` belirir —
 * hiçbir kod üretimi (codegen) yok, sadece TypeScript tip çıkarımı.
 */

import { createTRPCRouter } from "~/server/trpc/trpc";
import { todoRouter } from "~/server/trpc/routers/todo";

export const appRouter = createTRPCRouter({
  todo: todoRouter,
});

/**
 * tRPC'nin SİHRİ BURADA: sunucu router'ının TİPİNİ dışa açıyoruz.
 * İstemci sadece bu tipi import eder (`import type`), çalışma zamanında
 * sunucu kodundan hiçbir şey bundle'a girmez. Uçtan uca tip güvenliği
 * bu tek satır sayesinde çalışır.
 */
export type AppRouter = typeof appRouter;
