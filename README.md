# tRPC Todo — öğrenme projesi

Next.js (App Router) + tRPC + Zod + Prisma/SQLite + Tailwind ile uçtan uca tip güvenli todo listesi.

## Kurulum

```bash
npm install
```

`postinstall` script'i `prisma generate`'i otomatik çalıştırır (Prisma tiplerini üretir).

```bash
npx prisma db push
```

`prisma/schema.prisma` dosyasını okuyup SQLite veritabanını (`prisma/dev.db`) oluşturur.
Ayrı bir veritabanı sunucusu kurmana gerek yok — SQLite tek bir dosyadır.

> Migration geçmişi tutmak istersen `npx prisma db push` yerine
> `npx prisma migrate dev --name init` kullan. `db push` prototip için daha hızlıdır.

```bash
npm run dev
```

http://localhost:3000

Veritabanını gözle incelemek için: `npm run db:studio`

## İstek nasıl akıyor?

```
Tarayıcı
  trpc.todo.list.useQuery({ completed: true })
        │  (React Query cache'e bakar, yoksa istek atar)
        ▼
  httpBatchLink  →  POST/GET /api/trpc/todo.list
        │
        ▼  src/app/api/trpc/[trpc]/route.ts
  fetchRequestHandler
        │
        ├─ createTRPCContext()      src/server/trpc/context.ts   → { db, headers }
        ├─ Zod input doğrulaması    src/server/trpc/schemas/     → geçersizse BAD_REQUEST
        ▼
  resolver                          src/server/trpc/routers/todo.ts
        │
        ▼
  Prisma → SQLite
        │
        ▼  superjson ile serialize
  Tarayıcı: data (Date'ler gerçek Date olarak gelir)
```

## Dosya haritası

| Dosya | Ne işe yarar |
|---|---|
| `src/server/db.ts` | Prisma Client singleton'ı (dev'de bağlantı sızıntısını önler) |
| `src/server/trpc/context.ts` | Her istekte oluşan context — procedure'lere `db` vb. taşır |
| `src/server/trpc/trpc.ts` | `initTRPC` kurulumu; `createTRPCRouter` + `publicProcedure` üretir |
| `src/server/trpc/schemas/todo.ts` | Zod şemaları + `z.infer` ile tip çıkarımı |
| `src/server/trpc/routers/todo.ts` | `create` / `list` / `toggle` / `delete` procedure'leri |
| `src/server/trpc/root.ts` | Kök router + `AppRouter` tipi (istemcinin tek bildiği şey) |
| `src/app/api/trpc/[trpc]/route.ts` | Tek HTTP uç noktası |
| `src/lib/trpc/client.ts` | `createTRPCReact<AppRouter>()` → React hook'ları |
| `src/lib/trpc/Provider.tsx` | QueryClient + tRPC client provider'ları |
| `src/app/_components/` | TodoForm, TodoList, TodoFilter |

## Denemeye değer

1. `src/server/trpc/routers/todo.ts` içindeki `create`'e yeni bir alan ekle
   (ör. `priority`) — istemci kodu **derlenmeyecek**. tRPC'nin uçtan uca tip
   güvenliği tam olarak bu.
2. `TodoForm.tsx` içindeki `utils.todo.list.invalidate()` satırını yorum satırı
   yap — todo eklendiğinde listenin güncellenmediğini gör. Cache invalidation'ın
   ne işe yaradığı böyle netleşir.
3. Boş başlıkla form gönder → istemci tarafı Zod hatası (network isteği yok).
4. `staleTime`'ı `Provider.tsx`'te 0 yap, sekme değiştirince refetch'leri izle.
