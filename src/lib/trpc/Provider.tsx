"use client";

/**
 * PROVIDER'LAR
 *
 * İki provider'ı iç içe sarıyoruz:
 *   - QueryClientProvider → React Query'nin cache deposu
 *   - trpc.Provider       → tRPC istemcisi (hangi URL'e, nasıl istek atılacak)
 *
 * `useState(() => ...)` kalıbı önemli: istemcileri render gövdesinde
 * `new QueryClient()` diye oluşturursak her render'da cache sıfırlanır.
 * useState'in lazy initializer'ı sayesinde bileşen ömrü boyunca tek instance olur.
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "~/lib/trpc/client";

function getBaseUrl() {
  // Tarayıcıda göreli URL yeterli.
  if (typeof window !== "undefined") return "";
  // Sunucuda mutlak URL gerekir.
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 5 sn boyunca veriyi "taze" say → sekme değiştirince gereksiz
            // refetch olmasın. Öğrenirken davranışı görmek için değiştirebilirsin.
            staleTime: 5 * 1000,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        /**
         * httpBatchLink: aynı anda yapılan birden fazla tRPC çağrısını TEK
         * HTTP isteğinde birleştirir. Sayfada 3 farklı useQuery varsa
         * 3 değil 1 network isteği görürsün.
         */
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          // Sunucudaki transformer ile AYNI olmalı, yoksa veri çözülemez.
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
