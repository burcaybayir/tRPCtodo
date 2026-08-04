/**
 * TODO ROUTER
 *
 * Bir router = birbirine yakın procedure'lerin sözlüğü.
 * Her procedure üç parçadan oluşur:
 *
 *   publicProcedure          → hangi procedure türü (auth kuralları vs.)
 *     .input(zodSchema)      → gelen veri doğrulaması (opsiyonel)
 *     .query() / .mutation() → çalıştırılacak fonksiyon
 *
 * query   → veri OKUR, yan etkisi yoktur, cache'lenir (HTTP GET gibi)
 * mutation→ veri DEĞİŞTİRİR, cache'lenmez (HTTP POST gibi)
 *
 * Resolver'a gelen `{ ctx, input }`:
 *   ctx   → context.ts'de kurduğumuz nesne (db, headers...)
 *   input → Zod'dan GEÇMİŞ, doğrulanmış ve tipi çıkarılmış veri.
 *           Yani burada `input.title`'ın string olduğuna güvenebilirsin;
 *           şema geçersizse resolver hiç çalışmaz, tRPC BAD_REQUEST döner.
 */

import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/trpc/trpc";
import {
  createTodoSchema,
  listTodosSchema,
  todoIdSchema,
} from "~/server/trpc/schemas/todo";

export const todoRouter = createTRPCRouter({
  /**
   * 1) create — yeni todo oluşturur.
   * title zorunlu, description opsiyonel (kurallar Zod şemasında).
   */
  create: publicProcedure
    .input(createTodoSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.todo.create({
        data: {
          title: input.title,
          description: input.description, // undefined ise DB'de NULL kalır
        },
      });
    }),

  /**
   * 2) list — todo'ları döner.
   * `completed` filtresi opsiyonel: verilmezse WHERE koşulu hiç eklenmez,
   * yani hepsi döner.
   */
  list: publicProcedure.input(listTodosSchema).query(async ({ ctx, input }) => {
    return ctx.db.todo.findMany({
      // Prisma'da bir alan `undefined` ise o koşul sorguya HİÇ eklenmez.
      // (`null` olsaydı "completed IS NULL" diye aranırdı — fark önemli.)
      where: { completed: input?.completed },
      orderBy: { createdAt: "desc" },
    });
  }),

  /**
   * 3) toggle — completed durumunu tersine çevirir.
   *
   * SQL'de "değeri tersine çevir" diye tek adımlık bir Prisma yardımcısı yok,
   * bu yüzden önce okuyup sonra yazıyoruz. Kayıt yoksa NOT_FOUND fırlatıyoruz;
   * bu hata istemcide `mutation.error.data.code` olarak okunabilir.
   */
  toggle: publicProcedure
    .input(todoIdSchema)
    .mutation(async ({ ctx, input }) => {
      const todo = await ctx.db.todo.findUnique({ where: { id: input.id } });

      if (!todo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Todo bulunamadı",
        });
      }

      return ctx.db.todo.update({
        where: { id: input.id },
        data: { completed: !todo.completed },
      });
    }),

  /**
   * 4) delete — todo'yu siler.
   *
   * Not: `delete` JavaScript'te bir anahtar kelime ama nesne özelliği olarak
   * kullanmak tamamen geçerli. İstemcide `trpc.todo.delete.useMutation()`
   * şeklinde çağıracağız.
   */
  delete: publicProcedure
    .input(todoIdSchema)
    .mutation(async ({ ctx, input }) => {
      // Var olmayan id'de Prisma P2025 fırlatır; onu anlamlı bir tRPC
      // hatasına çeviriyoruz ki istemci düzgün bir mesaj görsün.
      const existing = await ctx.db.todo.findUnique({ where: { id: input.id } });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Silinecek todo bulunamadı",
        });
      }

      await ctx.db.todo.delete({ where: { id: input.id } });

      return { id: input.id };
    }),
});
