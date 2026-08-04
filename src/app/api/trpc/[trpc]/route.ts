/**
 * HTTP UÇ NOKTASI (Next.js App Router Route Handler)
 *
 * tRPC'nin tek bir HTTP giriş kapısı vardır. `[trpc]` dinamik segmenti
 * sayesinde /api/trpc/todo.list, /api/trpc/todo.create ... hepsi bu dosyaya
 * düşer ve `fetchRequestHandler` doğru procedure'e yönlendirir.
 *
 * Akış:
 *   fetch("/api/trpc/todo.list")
 *     → fetchRequestHandler
 *     → createContext()   (context.ts)
 *     → appRouter içindeki todo.list resolver'ı
 *     → JSON yanıt (superjson ile serialize edilmiş)
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
    // Dev'de sunucu tarafındaki hataları terminalde açıkça görmek için:
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`❌ tRPC hatası [${path ?? "<no-path>"}]:`, error.message);
          }
        : undefined,
  });

// GET → query'ler, POST → mutation'lar. İkisi de aynı handler'a gider.
export { handler as GET, handler as POST };
