/**
 * ROOT ROUTER (app router)
 *
 * Merges every sub-router into a single tree. Each key you add here becomes a
 * namespace on the client:
 *
 *   todoRouter.create  →  trpc.todo.create.useMutation()
 *   todoRouter.list    →  trpc.todo.list.useQuery()
 *
 * Add `user: userRouter` later and `trpc.user.*` appears on the client — no
 * code generation involved, just TypeScript inference.
 */

import { createTRPCRouter } from "~/server/trpc/trpc";
import { todoRouter } from "~/server/trpc/routers/todo";

export const appRouter = createTRPCRouter({
  todo: todoRouter,
});

/**
 * THIS IS WHERE tRPC'S MAGIC LIVES: we export the TYPE of the server router.
 * The client imports only this type (`import type`), so at runtime none of the
 * server code ends up in the browser bundle. End-to-end type safety rests on
 * this single line.
 */
export type AppRouter = typeof appRouter;
