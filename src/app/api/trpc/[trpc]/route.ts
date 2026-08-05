/**
 * HTTP ENDPOINT (Next.js App Router route handler)
 *
 * tRPC has a single HTTP entry point. Thanks to the `[trpc]` dynamic segment,
 * /api/trpc/todo.list, /api/trpc/todo.create and everything else land in this
 * file, and `fetchRequestHandler` dispatches to the right procedure.
 *
 * The flow:
 *   fetch("/api/trpc/todo.list")
 *     → fetchRequestHandler
 *     → createContext()   (context.ts)
 *     → the todo.list resolver inside appRouter
 *     → JSON response (serialized with superjson)
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { appRouter } from "~/server/trpc/root";
import { createTRPCContext } from "~/server/trpc/context";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    // Makes server-side errors visible in the terminal during development:
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`❌ tRPC error [${path ?? "<no-path>"}]:`, error.message);
          }
        : undefined,
  });

// GET → queries, POST → mutations. Both go to the same handler.
export { handler as GET, handler as POST };
