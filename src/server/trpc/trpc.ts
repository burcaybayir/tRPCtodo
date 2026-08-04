/**
 * tRPC KURULUMU (initialization)
 *
 * Bu dosya tRPC'nin "yapı taşlarını" üretir ve dışa açar:
 *   - router          → procedure'leri gruplamak için
 *   - publicProcedure → herkesin çağırabildiği endpoint tanımlayıcısı
 *
 * ÖNEMLİ KURAL: `initTRPC` uygulamada SADECE BİR KEZ çağrılmalı. O yüzden
 * router'ları bu dosyada tanımlamıyoruz; sadece araçları üretip export ediyoruz.
 * Router'lar `routers/` klasöründe, bu araçları import ederek yazılır.
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TRPCContext } from "~/server/trpc/context";

const t = initTRPC.context<TRPCContext>().create({
  /**
   * transformer: veri ağdan geçerken JSON'ın taşıyamadığı tipleri korur.
   * JSON'da `Date` yoktur — superjson olmasaydı `createdAt` istemciye
   * string olarak düşerdi. superjson sayesinde client'ta gerçek `Date` olur.
   */
  transformer: superjson,

  /**
   * errorFormatter: sunucudan istemciye giden hata nesnesini zenginleştirir.
   * Zod doğrulaması patladığında ham hatanın yanına `zodError` alanını
   * ekliyoruz; frontend'de hangi alanın neden geçersiz olduğunu
   * (ör. "title: Başlık zorunludur") buradan okuyacağız.
   */
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/** Router oluşturucu: `createTRPCRouter({ ... })` */
export const createTRPCRouter = t.router;

/**
 * Public procedure: kimlik doğrulaması gerektirmeyen endpoint.
 * Auth eklemek isteseydin şöyle bir "protectedProcedure" tanımlardın:
 *
 *   export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
 *     if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
 *     return next({ ctx: { ...ctx, user: ctx.user } }); // user artık non-null
 *   });
 */
export const publicProcedure = t.procedure;
