/**
 * tRPC INITIALIZATION
 *
 * This file produces and exports tRPC's building blocks:
 *   - router          → for grouping procedures
 *   - publicProcedure → the definition helper for an endpoint anyone can call
 *
 * IMPORTANT RULE: `initTRPC` must be called EXACTLY ONCE per application. That
 * is why no routers are defined here — this file only builds the tools and
 * exports them. Routers live in `routers/`, importing what they need from here.
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TRPCContext } from "~/server/trpc/context";

const t = initTRPC.context<TRPCContext>().create({
  /**
   * transformer: preserves types JSON cannot carry across the wire.
   * JSON has no `Date` — without superjson, `createdAt` would arrive at the
   * client as a string. With it, the client gets a real `Date`.
   */
  transformer: superjson,

  /**
   * errorFormatter: enriches the error object sent from server to client.
   * When Zod validation fails we attach a `zodError` field alongside the raw
   * error, so the frontend can tell WHICH field was invalid and why
   * (e.g. "title: Title is required").
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

/** Router factory: `createTRPCRouter({ ... })` */
export const createTRPCRouter = t.router;

/**
 * Public procedure: an endpoint that requires no authentication.
 * If you wanted auth, you would define a "protectedProcedure" like this:
 *
 *   export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
 *     if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
 *     return next({ ctx: { ...ctx, user: ctx.user } }); // user is now non-null
 *   });
 */
export const publicProcedure = t.procedure;
