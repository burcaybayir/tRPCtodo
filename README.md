# tRPC + GraphQL — a learning project

One Next.js app, one database, **two independent API layers** running side by side:

| Tab | API | Endpoint | Client | Cache |
|---|---|---|---|---|
| **Todos** | tRPC | `/api/trpc` | `@trpc/react-query` | React Query |
| **Task Assignment** | GraphQL | `/api/graphql` | Apollo Client | Apollo `InMemoryCache` |

Both write to the same SQLite file through the same Prisma client. Everything
above the database is separate — the Todos tab never touches Apollo, and the
Task Assignment tab never touches tRPC. The point is to solve comparable
problems in two protocols and see the differences next to each other.

## Setup

```bash
npm install
```

The `postinstall` script runs `prisma generate` automatically (it produces the
Prisma types).

```bash
npx prisma migrate deploy
```

Applies the two migrations under `prisma/migrations/` in order: `0_init` (the
Todo table) and `..._add_user_and_task` (the User and Task tables). No separate
database server to install — SQLite is a single file.

> If you change the schema yourself, create a new migration with
> `npx prisma migrate dev --name <name>`. `prisma db push` also works, but it
> keeps no migration history.

```bash
npm run codegen
```

Generates TypeScript types from the GraphQL schema into
`src/lib/apollo/generated/graphql.ts`. The generated file is committed, so this
step is **not required** on a fresh clone — but you must re-run it every time
you change the schema or an operation.

```bash
npm run dev
```

- App: http://localhost:3000
- GraphQL explorer (Apollo Sandbox): http://localhost:3000/api/graphql
- Database browser: `npm run db:studio`

## How a request flows

```
Browser
  trpc.todo.list.useQuery({ completed: true })
        │  (checks the React Query cache, requests if it misses)
        ▼
  httpBatchLink  →  POST/GET /api/trpc/todo.list
        │
        ▼  src/app/api/trpc/[trpc]/route.ts
  fetchRequestHandler
        │
        ├─ createTRPCContext()   src/server/trpc/context.ts  → { db, headers }
        ├─ Zod input validation  src/server/trpc/schemas/    → BAD_REQUEST if invalid
        ▼
  resolver                       src/server/trpc/routers/todo.ts
        │
        ▼
  Prisma → SQLite
        │
        ▼  serialized with superjson
  Browser: data (Dates arrive as real Date objects)
```

The GraphQL side, the same flow in its own terms:

```
Browser
  useQuery(GET_USERS)        ← what you send is a DOCUMENT, not a procedure name
        │  (checks the Apollo InMemoryCache, requests if it misses)
        ▼
  HttpLink  →  POST /api/graphql          ← one URL, the same for every operation
        │
        ▼  src/app/api/graphql/route.ts
  ApolloServer (startServerAndCreateNextHandler)
        │
        ├─ createGraphQLContext()  src/server/graphql/context.ts  → { db }
        ├─ SDL validation          src/server/graphql/typeDefs.ts → invalid queries never run
        ▼
  resolver tree                    src/server/graphql/resolvers.ts
    Query.users        → SELECT * FROM User
      └─ User.task     → INVOKED once per user (field resolver)
        │
        ▼
  Prisma → SQLite
        │
        ▼  plain JSON (no Date type — which is why Task has no date field)
  Browser: exactly the fields that were asked for
```

## The two APIs side by side

| | tRPC (Todos) | GraphQL (Task Assignment) |
|---|---|---|
| Where the contract lives | Nowhere — `typeof appRouter` | The SDL in `typeDefs.ts` |
| Where types come from | Inferred, zero steps | Generated via `npm run codegen` |
| What the client chooses | Nothing — the server fixes the shape | Which fields come back |
| Who can consume it | TypeScript only | Any language, any client |
| Discoverability | None (no runtime self-description) | Introspection + the `/api/graphql` explorer |
| Unit of caching | Query key (`todo.list` + input) | Normalized object (`User:abc123`) |
| Refreshing | `utils.todo.list.invalidate()` | `refetchQueries: [{ query: GET_USERS }]` |
| Error channel | HTTP status code + `TRPCError` | HTTP 200 + an `errors` array in the body |

## File map

| File | What it does |
|---|---|
| `src/server/db.ts` | Prisma Client singleton (prevents connection leaks in dev) |
| `src/server/trpc/context.ts` | Per-request context — carries `db` and friends to procedures |
| `src/server/trpc/trpc.ts` | `initTRPC` setup; produces `createTRPCRouter` + `publicProcedure` |
| `src/server/trpc/schemas/todo.ts` | Zod schemas + type inference with `z.infer` |
| `src/server/trpc/routers/todo.ts` | The `create` / `list` / `toggle` / `delete` procedures |
| `src/server/trpc/root.ts` | Root router + the `AppRouter` type (all the client knows) |
| `src/app/api/trpc/[trpc]/route.ts` | The single HTTP endpoint |
| `src/lib/trpc/client.ts` | `createTRPCReact<AppRouter>()` → React hooks |
| `src/lib/trpc/Provider.tsx` | QueryClient + tRPC client providers |
| `src/app/_components/` | TodoForm, TodoList, TodoFilter |

### GraphQL side

| File | What it does |
|---|---|
| `src/server/graphql/typeDefs.ts` | **The SDL schema** — type/Query/Mutation definitions with docstrings |
| `src/server/graphql/context.ts` | Per-request `{ db }` — the counterpart of the tRPC context |
| `src/server/graphql/resolvers.ts` | Query/Mutation resolvers + the `User.task` and `Task.user` field resolvers + N+1 notes |
| `src/app/api/graphql/route.ts` | Wires Apollo Server into a Next.js route handler |
| `src/lib/apollo/client.ts` | `ApolloClient` + `InMemoryCache` |
| `src/lib/apollo/Provider.tsx` | `ApolloProvider` (nested inside the tRPC provider in the layout) |
| `src/lib/apollo/operations.ts` | Every query and mutation document |
| `src/lib/apollo/generated/graphql.ts` | **Generated file** — do not edit by hand, run `npm run codegen` |
| `codegen.ts` | Codegen configuration |
| `src/app/_components/task/` | CreateUserForm, CreateTaskForm, AssignTaskForm, EntityLists, AssignmentsTable |

## Worth trying

1. Add a new field to `create` in `src/server/trpc/routers/todo.ts` (say
   `priority`) — the client code **stops compiling**. That is exactly what
   tRPC's end-to-end type safety buys you.
2. Comment out `utils.todo.list.invalidate()` in `TodoForm.tsx`, then add a
   todo: the list does not update. Nothing makes the value of cache
   invalidation clearer.
3. Submit the form with an empty title → a client-side Zod error, with no
   network request at all.
4. Set `staleTime` to 0 in `Provider.tsx` and watch the refetches as you switch
   tabs.

### GraphQL side

5. Delete the `task { ... }` block from `GET_USERS` in `operations.ts` — the
   server stops running the `User.task` resolver **entirely**. A client that
   can change the server's query plan is something tRPC has no answer for.
6. Comment out `refetchQueries` in `AssignTaskForm.tsx`, then assign a task:
   the table updates instantly (the normalized cache patches `Task:<id>`) while
   the users list keeps saying "no task assigned". That is where you see why
   the two ends of a relation are not the same object.
7. Rename `User: { task: ... }` to `User: { tasks: ... }` in `resolvers.ts` —
   the server fails at **startup**, not on the first request that touches the
   field: `User.tasks defined in resolvers, but not in schema`. Schema and
   resolvers are cross-checked the moment `new ApolloServer(...)` runs.
   (Note: this check validates that fields *exist*, not the types of the values
   returned — returning a string for an `Int!` field is a runtime error.)
8. Change `findUnique` to `findFirst` in the `User.task` resolver and watch the
   Prisma query log: one `IN (?,?,?)` query turns into one query per user. That
   is what N+1 is, and why Prisma usually swallows it silently here (details in
   the note at the bottom of `resolvers.ts`).
9. Try assigning the same task twice → `TASK_ALREADY_ASSIGNED`. Check the
   network tab: HTTP **200**, with `errors` in the body. In GraphQL, "did the
   request succeed" and "did the operation succeed" are different questions.
