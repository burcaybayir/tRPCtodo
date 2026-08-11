/**
 * GRAPHQL CONTEXT
 *
 * Same idea as the tRPC context in `src/server/trpc/context.ts`: an object
 * built once per HTTP request and handed to every resolver.
 *
 * Two differences worth noticing:
 *
 *  1. tRPC passes it as `{ ctx }` — the second destructured property of a
 *     single argument. GraphQL passes it as the THIRD POSITIONAL argument of
 *     every resolver: `(parent, args, context, info)`. Same data, older
 *     calling convention.
 *
 *  2. In tRPC the context type is inferred and flows automatically into every
 *     procedure. Here we must declare `GraphQLContext` and thread it through
 *     `ApolloServer<GraphQLContext>` by hand.
 *
 * We deliberately reuse the SAME Prisma singleton the tRPC side uses, so both
 * APIs talk to one database and one connection pool.
 *
 * PER-REQUEST STATE LIVES HERE
 *
 * `db` is a process-wide singleton, but `loaders` and `queryCounter` are built
 * fresh on every call. That distinction is the whole reason this is a FUNCTION
 * and not a constant object: a DataLoader caches, and a cache that outlives its
 * request starts serving one caller's rows to another. See team/loaders.ts.
 */

import { db } from "~/server/db";
import {
  createLoaders,
  type Loaders,
  type QueryCounter,
} from "~/server/graphql/team/loaders";

export type GraphQLContext = {
  db: typeof db;
  loaders: Loaders;
  queryCounter: QueryCounter;
};

export function createGraphQLContext(): GraphQLContext {
  // Fresh per request — never hoist these out of the function.
  const queryCounter: QueryCounter = { count: 0 };

  return {
    db,
    queryCounter,
    loaders: createLoaders(db, queryCounter),
  };
}
