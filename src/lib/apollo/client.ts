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

import { ApolloClient, HttpLink, InMemoryCache, split } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import {
  getMainDefinition,
  relayStylePagination,
} from "@apollo/client/utilities";
import { createClient } from "graphql-ws";

/**
 * TWO TRANSPORTS, ONE CLIENT
 *
 * Queries and mutations go over HTTP; subscriptions go over WebSocket. The
 * components never choose — `split` inspects each outgoing document and routes
 * it, so `useQuery` and `useSubscription` look identical at the call site while
 * travelling over completely different wires.
 *
 * The WS link is only built in the browser. During server-side rendering there
 * is no WebSocket to open (and `graphql-ws` would try), so on the server the
 * HTTP link is used alone. Subscriptions cannot run during SSR anyway — there
 * is nothing to stream into.
 */
function makeLink() {
  const httpLink = new HttpLink({
    // Same-origin relative URL — this points at src/app/api/graphql/route.ts.
    uri: "/api/graphql",
  });

  if (typeof window === "undefined") return httpLink;

  const wsLink = new GraphQLWsLink(
    createClient({
      // Served by server.ts, NOT by the App Router. Note the protocol swap:
      // ws:// on http, wss:// on https.
      url: `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/graphql/ws`,
      // graphql-ws reconnects automatically after a dropped connection, which
      // is the main reason to use it over a hand-rolled WebSocket. It does not
      // replay what you missed while offline, though — a subscription is a
      // live feed, not a durable queue. If missing events matters, refetch on
      // reconnect.
      retryAttempts: 5,
    }),
  );

  return split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === "OperationDefinition" &&
        definition.operation === "subscription"
      );
    },
    wsLink, // true  → subscriptions
    httpLink, // false → queries and mutations
  );
}

export function makeApolloClient() {
  return new ApolloClient({
    link: makeLink(),

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
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            /**
             * PAGINATION NEEDS A MERGE RULE.
             *
             * By default the cache treats every `tasksConnection` result as
             * THE value of that field, so page 2 would replace page 1 instead
             * of extending it. The cache cannot guess otherwise: it has no
             * idea these are pages of one list rather than two different
             * answers.
             *
             * `relayStylePagination` supplies the rule — concatenate `edges`,
             * keep the newest `pageInfo`. It is a helper for a merge function
             * you could write by hand:
             *
             *   merge(existing, incoming) {
             *     return { ...incoming, edges: [...(existing?.edges ?? []), ...incoming.edges] };
             *   }
             *
             * `keyArgs` is the important part. It lists the arguments that
             * IDENTIFY a list, as opposed to arguments that merely position
             * you within it. `teamId` and `type` change WHICH tasks; `first`
             * and `after` change WHERE in them. Leave `teamId` out and
             * switching teams would append one team's tasks onto another's —
             * a genuinely confusing bug, and the most common way this helper
             * is misconfigured.
             */
            tasksConnection: relayStylePagination(["teamId", "type"]),
          },
        },
      },
    }),
  });
}
