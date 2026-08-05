/**
 * tRPC CLIENT (React hooks)
 *
 * `createTRPCReact<AppRouter>()` turns the server router's type into an object
 * of React Query-backed hooks:
 *
 *   trpc.todo.list.useQuery()
 *   trpc.todo.create.useMutation()
 *   trpc.useUtils()   → for reaching into the cache (invalidate, setData, ...)
 *
 * NOTE the `import type`. Only the TYPE is imported, so server code (Prisma,
 * the database connection, and so on) never reaches the browser bundle.
 */

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "~/server/trpc/root";

export const trpc = createTRPCReact<AppRouter>();
