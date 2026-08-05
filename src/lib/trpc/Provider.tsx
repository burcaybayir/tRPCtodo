"use client";

/**
 * PROVIDERS
 *
 * Two providers nested together:
 *   - QueryClientProvider → React Query's cache store
 *   - trpc.Provider       → the tRPC client (which URL, how requests are sent)
 *
 * The `useState(() => ...)` pattern matters: creating the clients inline in the
 * render body with `new QueryClient()` would reset the cache on every render.
 * useState's lazy initializer keeps a single instance for the component's life.
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "~/lib/trpc/client";

function getBaseUrl() {
  // A relative URL is enough in the browser.
  if (typeof window !== "undefined") return "";
  // On the server an absolute URL is required.
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Treat data as "fresh" for 5s so switching tabs does not trigger
            // pointless refetches. Change it to watch the behaviour while
            // you are learning.
            staleTime: 5 * 1000,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        /**
         * httpBatchLink: merges multiple simultaneous tRPC calls into ONE HTTP
         * request. With three separate useQuery calls on a page you see one
         * network request, not three.
         */
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          // Must MATCH the transformer on the server, or the payload cannot be
          // decoded.
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
