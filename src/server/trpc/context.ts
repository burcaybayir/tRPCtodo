/**
 * tRPC CONTEXT
 *
 * The context is an object built once per REQUEST and handed to every
 * procedure (query or mutation) as an argument. It is how procedures reach
 * their outside dependencies: the database, session data, request headers.
 *
 * Mental model:
 *   HTTP request → createContext() → middleware → procedure resolver
 *
 * In a real application you would resolve the session here and put `user` on
 * the context:
 *   const session = await auth(); return { db, user: session?.user ?? null };
 * This example has no auth, so it carries only `db`.
 */

import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db } from "~/server/db";

export function createTRPCContext(opts: FetchCreateContextFnOptions) {
  return {
    db,
    // Kept as an example in case you need the headers
    // (for reading an Authorization token, say).
    headers: opts.req.headers,
  };
}

/**
 * We DERIVE the context type from the function's return type, so adding a new
 * field to the context never requires updating a type by hand.
 */
export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
