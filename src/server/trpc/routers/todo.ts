/**
 * TODO ROUTER
 *
 * A router is a dictionary of closely related procedures.
 * Every procedure is built from three parts:
 *
 *   publicProcedure          → which kind of procedure (auth rules, etc.)
 *     .input(zodSchema)      → validation of incoming data (optional)
 *     .query() / .mutation() → the function that runs
 *
 * query    → READS data, has no side effects, is cached (like HTTP GET)
 * mutation → CHANGES data, is not cached (like HTTP POST)
 *
 * The `{ ctx, input }` a resolver receives:
 *   ctx   → the object built in context.ts (db, headers, ...)
 *   input → data that has ALREADY PASSED Zod: validated and typed.
 *           So you can trust that `input.title` is a string here; if the
 *           schema rejects it the resolver never runs and tRPC returns
 *           BAD_REQUEST.
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
   * 1) create — creates a new todo.
   * title is required, description is optional (the rules live in the Zod
   * schema).
   */
  create: publicProcedure
    .input(createTodoSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.todo.create({
        data: {
          title: input.title,
          description: input.description, // undefined stays NULL in the database
        },
      });
    }),

  /**
   * 2) list — returns todos.
   * The `completed` filter is optional: omit it and no WHERE clause is added
   * at all, so everything comes back.
   */
  list: publicProcedure.input(listTodosSchema).query(async ({ ctx, input }) => {
    return ctx.db.todo.findMany({
      // In Prisma, a field set to `undefined` drops that condition from the
      // query entirely. (`null` would instead search for "completed IS NULL" —
      // an important difference.)
      where: { completed: input?.completed },
      orderBy: { createdAt: "desc" },
    });
  }),

  /**
   * 3) toggle — flips the completed flag.
   *
   * Prisma has no single-step "invert this value" helper, so we read first and
   * then write. If the row is missing we throw NOT_FOUND; the client reads
   * that back as `mutation.error.data.code`.
   */
  toggle: publicProcedure
    .input(todoIdSchema)
    .mutation(async ({ ctx, input }) => {
      const todo = await ctx.db.todo.findUnique({ where: { id: input.id } });

      if (!todo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Todo not found",
        });
      }

      return ctx.db.todo.update({
        where: { id: input.id },
        data: { completed: !todo.completed },
      });
    }),

  /**
   * 4) delete — removes a todo.
   *
   * Note: `delete` is a JavaScript keyword, but using it as an object property
   * is perfectly valid. On the client we will call it as
   * `trpc.todo.delete.useMutation()`.
   */
  delete: publicProcedure
    .input(todoIdSchema)
    .mutation(async ({ ctx, input }) => {
      // Prisma throws P2025 for a missing id; we translate that into a
      // meaningful tRPC error so the client can show a usable message.
      const existing = await ctx.db.todo.findUnique({ where: { id: input.id } });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Todo to delete was not found",
        });
      }

      await ctx.db.todo.delete({ where: { id: input.id } });

      return { id: input.id };
    }),
});
