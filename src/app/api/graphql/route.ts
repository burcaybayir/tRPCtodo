/**
 * GRAPHQL HTTP ENDPOINT
 *
 * The GraphQL counterpart of `src/app/api/trpc/[trpc]/route.ts`. Both are
 * ordinary Next.js App Router route handlers; they simply hand the request to
 * a different engine.
 *
 * One structural similarity worth noticing: like tRPC, GraphQL uses a SINGLE
 * URL for the entire API. `/api/graphql` serves every query and mutation —
 * which operation runs is decided by the request body, not the path. That is
 * why neither of these routes needs a segment per endpoint the way REST does.
 *
 * The difference is the file name: tRPC needs `[trpc]` because it encodes the
 * procedure name in the path (`/api/trpc/todo.list`). GraphQL does not — the
 * path is always exactly `/api/graphql`.
 */

import { ApolloServer } from "@apollo/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import type { NextRequest } from "next/server";
import { typeDefs } from "~/server/graphql/typeDefs";
import { resolvers } from "~/server/graphql/resolvers";
import {
  createGraphQLContext,
  type GraphQLContext,
} from "~/server/graphql/context";

/**
 * The server is created once at module load, not per request.
 *
 * At this moment Apollo validates the SDL against the resolver map: a type
 * declared in typeDefs.ts with no matching implementation, or a resolver for a
 * field that does not exist in the schema, fails HERE — at startup, not on the
 * first request that happens to touch it.
 */
const server = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
});

const handler = startServerAndCreateNextHandler<NextRequest, GraphQLContext>(
  server,
  {
    // Runs per request; the returned object becomes the resolvers' 3rd argument.
    context: async () => createGraphQLContext(),
  },
);

/**
 * GET serves Apollo Sandbox (the in-browser explorer) and supports GET queries.
 * POST carries real operations.
 *
 * Open http://localhost:3000/api/graphql in a browser to explore the schema
 * interactively — introspection gives you autocomplete and inline docs for
 * free, which is exactly the affordance tRPC cannot offer, since a tRPC API
 * has no runtime description of itself.
 */
/**
 * The handler is wrapped rather than re-exported directly.
 *
 * `@as-integrations/next` supports both the old Pages API (`req, res`) and the
 * App Router (`request`) through two overloads. Exporting it as-is makes
 * TypeScript pick the Pages overload, and Next's route type checker then
 * rejects it. Calling it with a single argument picks the App Router overload,
 * which returns a plain `Response` — exactly what a route handler must return.
 */
export function GET(request: NextRequest): Promise<Response> {
  return handler(request);
}

export function POST(request: NextRequest): Promise<Response> {
  return handler(request);
}
