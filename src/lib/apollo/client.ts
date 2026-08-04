/**
 * APOLLO CLIENT
 *
 * The GraphQL counterpart of `src/lib/trpc/client.ts`.
 *
 * The contrast is sharp and worth staring at for a second:
 *
 *   tRPC   → `createTRPCReact<AppRouter>()`. One line, and every hook is typed
 *            because `AppRouter` is a TypeScript type imported straight from
 *            the server. No network description, no build step.
 *
 *   Apollo → we describe the transport by hand (which URL, which link chain)
 *            and the client knows NOTHING about our schema at compile time.
 *            Types come separately, from GraphQL Code Generator (see
 *            `codegen.ts`), which reads the SDL and writes TypeScript for us.
 *
 * Same destination, opposite directions: tRPC derives types from code, GraphQL
 * derives code from a schema.
 */

import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

export function makeApolloClient() {
  return new ApolloClient({
    link: new HttpLink({
      // Same-origin relative URL — this points at src/app/api/graphql/route.ts.
      uri: "/api/graphql",
    }),

    /**
     * InMemoryCache is a NORMALIZED cache, and this is the deepest difference
     * from React Query (which tRPC uses underneath).
     *
     * React Query caches per query key: the result of `todo.list` is one opaque
     * blob stored under one key. Apollo instead splits every response into
     * individual objects keyed by `__typename:id` — `User:abc123` — and stores
     * them in one flat table.
     *
     * The practical consequence shows up on mutations. When `assignTaskToUser`
     * returns a Task with id `x`, Apollo recognises `Task:x` as something it
     * already holds and patches it everywhere it appears on screen — no
     * refetch, no invalidation. That auto-update only works for fields the
     * mutation actually returned on objects the cache already knew about;
     * anything else (a list gaining a new member, for instance) still needs an
     * explicit refetch. See the comments in the task components.
     */
    cache: new InMemoryCache(),
  });
}
