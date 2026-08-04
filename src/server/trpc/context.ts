/**
 * tRPC CONTEXT
 *
 * Context, HER istek için bir kez oluşturulan ve tüm procedure'lere
 * (query/mutation) argüman olarak geçilen nesnedir. Procedure'ler dışarıya
 * bağımlılıklarına (veritabanı, oturum bilgisi, request header'ları...)
 * buradan erişir.
 *
 * Zihin haritası:
 *   HTTP isteği → createContext() → middleware'ler → procedure resolver'ı
 *
 * Gerçek bir uygulamada burada oturumu çözer ve `user`'ı context'e koyardın:
 *   const session = await auth(); return { db, user: session?.user ?? null };
 * Bu örnekte auth yok, o yüzden sadece `db` koyuyoruz.
 */

import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db } from "~/server/db";

export function createTRPCContext(opts: FetchCreateContextFnOptions) {
  return {
    db,
    // Header'lara ihtiyacın olursa diye örnek olarak duruyor
    // (ör. Authorization token'ı okumak için).
    headers: opts.req.headers,
  };
}

/**
 * Context'in tipini fonksiyonun dönüş tipinden ÇIKARIYORUZ.
 * Böylece context'e yeni bir alan eklediğinde tipi elle güncellemen gerekmez.
 */
export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
