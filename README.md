# tRPC + GraphQL — öğrenme projesi

Tek bir Next.js uygulaması, tek bir veritabanı, yan yana duran **iki bağımsız API katmanı**:

| Sekme | API | Endpoint | İstemci | Cache |
|---|---|---|---|---|
| **Todos** | tRPC | `/api/trpc` | `@trpc/react-query` | React Query |
| **Task Assignment** | GraphQL | `/api/graphql` | Apollo Client | Apollo `InMemoryCache` |

İkisi de aynı Prisma client üzerinden aynı SQLite dosyasına yazar. Veritabanının
üstündeki her şey ayrıdır — Todos sekmesi Apollo'yu, Task Assignment sekmesi tRPC'yi
hiç görmez. Amaç aynı problemi iki protokolde çözerken farkları yan yana görmek.

## Kurulum

```bash
npm install
```

`postinstall` script'i `prisma generate`'i otomatik çalıştırır (Prisma tiplerini üretir).

```bash
npx prisma migrate deploy
```

`prisma/migrations/` altındaki iki migration'ı sırayla uygular:
`0_init` (Todo tablosu) ve `..._add_user_and_task` (User + Task tabloları).
Ayrı bir veritabanı sunucusu kurmana gerek yok — SQLite tek bir dosyadır.

> Şemayı kendin değiştirirsen yeni migration üret: `npx prisma migrate dev --name <ad>`.
> `prisma db push` de çalışır ama migration geçmişi tutmaz.

```bash
npm run codegen
```

GraphQL şemasından TypeScript tiplerini üretir (`src/lib/apollo/generated/graphql.ts`).
Üretilen dosya repoda commit'li olduğu için bu adım ilk kurulumda **zorunlu değil** —
ama şemayı veya bir operation'ı her değiştirdiğinde tekrar çalıştırman gerekir.

```bash
npm run dev
```

- Uygulama: http://localhost:3000
- GraphQL explorer (Apollo Sandbox): http://localhost:3000/api/graphql
- Veritabanı arayüzü: `npm run db:studio`

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

GraphQL tarafı, aynı akışın karşılığı:

```
Tarayıcı
  useQuery(GET_USERS)          ← gönderilen şey bir DOKÜMAN, bir prosedür adı değil
        │  (Apollo InMemoryCache'e bakar, yoksa istek atar)
        ▼
  HttpLink  →  POST /api/graphql        ← tek URL, her operation için aynı
        │
        ▼  src/app/api/graphql/route.ts
  ApolloServer (startServerAndCreateNextHandler)
        │
        ├─ createGraphQLContext()    src/server/graphql/context.ts  → { db }
        ├─ SDL doğrulaması           src/server/graphql/typeDefs.ts → geçersizse istek hiç çalışmaz
        ▼
  resolver ağacı                     src/server/graphql/resolvers.ts
    Query.users        → SELECT * FROM User
      └─ User.task     → her kullanıcı için bir kez ÇAĞRILIR (field resolver)
        │
        ▼
  Prisma → SQLite
        │
        ▼  düz JSON (Date yok — bu yüzden Task modelinde tarih alanı da yok)
  Tarayıcı: istenen alanlar, istenen şekilde
```

## İki API yan yana

| | tRPC (Todos) | GraphQL (Task Assignment) |
|---|---|---|
| Sözleşme nerede | Yok — `typeof appRouter` | `typeDefs.ts` içindeki SDL |
| Tipler nereden | Otomatik çıkarım, sıfır adım | `npm run codegen` ile üretim |
| İstemci ne seçer | Hiçbir şey — sunucu şekli belirler | Hangi alanların döneceğini istemci belirler |
| Kimler tüketebilir | Sadece TypeScript | Her dil, her istemci |
| Keşfedilebilirlik | Yok (runtime'da kendini tarif etmez) | Introspection + `/api/graphql` explorer |
| Cache birimi | Query key (`todo.list` + input) | Normalize nesne (`User:abc123`) |
| Tazeleme | `utils.todo.list.invalidate()` | `refetchQueries: [{ query: GET_USERS }]` |
| Hata kanalı | HTTP durum kodu + `TRPCError` | HTTP 200 + gövdede `errors` dizisi |

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

### GraphQL tarafı

| Dosya | Ne işe yarar |
|---|---|
| `src/server/graphql/typeDefs.ts` | **SDL şeması** — type/Query/Mutation tanımları, docstring'lerle |
| `src/server/graphql/context.ts` | Her istekte oluşan `{ db }` — tRPC context'inin karşılığı |
| `src/server/graphql/resolvers.ts` | Query/Mutation resolver'ları + `User.task` ve `Task.user` field resolver'ları + N+1 notları |
| `src/app/api/graphql/route.ts` | Apollo Server'ı Next.js route handler'ına bağlar |
| `src/lib/apollo/client.ts` | `ApolloClient` + `InMemoryCache` |
| `src/lib/apollo/Provider.tsx` | `ApolloProvider` (layout'ta tRPC provider'ının içinde) |
| `src/lib/apollo/operations.ts` | Tüm query/mutation dokümanları |
| `src/lib/apollo/generated/graphql.ts` | **Üretilen dosya** — elle düzenleme, `npm run codegen` çalıştır |
| `codegen.ts` | Codegen yapılandırması |
| `src/app/_components/task/` | CreateUserForm, CreateTaskForm, AssignTaskForm, EntityLists, AssignmentsTable |

## Denemeye değer

1. `src/server/trpc/routers/todo.ts` içindeki `create`'e yeni bir alan ekle
   (ör. `priority`) — istemci kodu **derlenmeyecek**. tRPC'nin uçtan uca tip
   güvenliği tam olarak bu.
2. `TodoForm.tsx` içindeki `utils.todo.list.invalidate()` satırını yorum satırı
   yap — todo eklendiğinde listenin güncellenmediğini gör. Cache invalidation'ın
   ne işe yaradığı böyle netleşir.
3. Boş başlıkla form gönder → istemci tarafı Zod hatası (network isteği yok).
4. `staleTime`'ı `Provider.tsx`'te 0 yap, sekme değiştirince refetch'leri izle.

### GraphQL tarafı

5. `operations.ts` içindeki `GET_USERS`'tan `task { ... }` bloğunu sil — sunucu
   `User.task` resolver'ını **hiç çalıştırmaz**. İstemcinin sorgu planını
   değiştirebilmesi GraphQL'in tRPC'de karşılığı olmayan özelliği.
6. `AssignTaskForm.tsx` içindeki `refetchQueries` satırını yorum yap, sonra bir
   görev ata: tablo anında güncellenir (normalize cache `Task:<id>`'yi yamalar)
   ama kullanıcı listesi "no task assigned" demeye devam eder. İlişkinin iki
   ucunun neden aynı şey olmadığı burada görünür.
7. `resolvers.ts`'te `User: { task: ... }`'ı `User: { tasks: ... }` yap —
   sunucu **açılışta** patlar, o alana dokunan ilk istekte değil:
   `User.tasks defined in resolvers, but not in schema`. Şema ile resolver'ın
   birbirini tutup tutmadığı `new ApolloServer(...)` anında doğrulanır.
   (Dikkat: bu kontrol alanların *varlığını* denetler, döndürülen değerin
   tipini değil — `Int!` alanına string döndürmek çalışma zamanı hatasıdır.)
8. `resolvers.ts` içindeki `User.task` resolver'ında `findUnique`'i `findFirst`
   yap ve Prisma sorgu log'unu izle: tek `IN (?,?,?)` sorgusu, kullanıcı başına
   bir sorguya dönüşür. N+1'in ne olduğu ve Prisma'nın onu neden çoğu zaman
   sessizce yuttuğu tam olarak bu (ayrıntı: `resolvers.ts` sonundaki not).
9. Aynı görevi iki kez atamayı dene → `TASK_ALREADY_ASSIGNED`. Ağ sekmesine bak:
   HTTP **200**, gövdede `errors`. GraphQL'de "istek başarılı" ile "işlem
   başarılı" farklı sorulardır.
