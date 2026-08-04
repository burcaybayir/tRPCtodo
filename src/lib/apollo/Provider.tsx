"use client";

/**
 * APOLLO PROVIDER
 *
 * Mirrors `src/lib/trpc/Provider.tsx`. Both use the same `useState(() => ...)`
 * trick so the client instance — and therefore the cache — survives re-renders
 * instead of being rebuilt on every one.
 *
 * This provider is nested INSIDE the tRPC provider in `layout.tsx`. The two are
 * completely independent: two caches, two transports, no shared state. The
 * Todos tab never touches Apollo, and the Task Assignment tab never touches
 * tRPC. That independence is the whole point of the exercise.
 *
 * Note the import path: in Apollo Client v4 the React bindings moved to the
 * `@apollo/client/react` entry point, while `ApolloClient`, `InMemoryCache` and
 * friends stay on `@apollo/client`. (In v3 everything lived at the root — most
 * tutorials you will find online still show the old path.)
 */

import { useState } from "react";
import { ApolloProvider as BaseApolloProvider } from "@apollo/client/react";
import { makeApolloClient } from "~/lib/apollo/client";

export function ApolloProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeApolloClient);

  return <BaseApolloProvider client={client}>{children}</BaseApolloProvider>;
}
