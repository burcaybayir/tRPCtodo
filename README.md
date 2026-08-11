# tRPC + GraphQL — a learning project

One Next.js app, one database, **three independent API surfaces** side by side:

| Tab | API | Endpoint | Client | Cache |
|---|---|---|---|---|
| **Todos** | tRPC | `/api/trpc` | `@trpc/react-query` | React Query |
| **Task Assignment** | GraphQL | `/api/graphql` | Apollo Client | Apollo `InMemoryCache` |
| **Team & Activity** | GraphQL + WebSocket | `/api/graphql` and `/api/graphql/ws` | Apollo Client | Apollo `InMemoryCache` |

All three write to the same SQLite file through the same Prisma client.
Everything above the database is separate — the Todos tab never touches Apollo,
and neither GraphQL tab touches tRPC. The point is to solve comparable problems
in different protocols and see the differences next to each other.

The third tab exists to exercise the parts of GraphQL the second one had no
reason to use: **nested queries** at two depths against one field, **DataLoader**
batching, **cursor pagination**, and **subscriptions** over WebSocket.

## Setup

```bash
npm install
```

The `postinstall` script runs `prisma generate` automatically (it produces the
Prisma types).

```bash
npx prisma migrate deploy
```

Applies the four migrations under `prisma/migrations/` in order: `0_init` (the
Todo table), `..._add_user_and_task` (the User and Task tables),
`..._add_team_and_comment` (Team, Comment, and the team foreign keys on User and
Task) and `..._add_voice_message` (the VoiceMessage table). No separate database
server to install — SQLite is a single file.

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
- GraphQL WebSocket: ws://localhost:3000/api/graphql/ws
- Database browser: `npm run db:studio`

### About the custom server

`npm run dev` runs `tsx server.ts`, **not** `next dev`. That is the one
unavoidable structural change the subscription forced.

A Next.js route handler is invoked per request and must return a Response, so it
has nowhere to hold a WebSocket open between calls. `server.ts` is a plain Node
HTTP server that hands every ordinary request to Next.js and intercepts only the
WebSocket upgrade on `/api/graphql/ws`. One process, one port, two transports —
and one shared in-memory PubSub, which is why the mutation (HTTP) and the
subscription (WebSocket) can talk to each other at all.

`npm run dev:no-ws` still runs plain `next dev` if you want to see the app
without the WebSocket. The Todos and Task Assignment tabs work identically
there; in the Team tab everything works except live comment delivery.

The cost of a custom server is real: it opts out of Next.js's automatic static
optimisation and cannot be deployed to serverless platforms as-is. Production
GraphQL APIs with subscriptions usually run as their own long-lived service for
exactly this reason.

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

And the subscription, which is a different shape entirely:

```
Browser
  useSubscription(COMMENT_ADDED_SUBSCRIPTION, { variables: { taskId } })
        │  the split link in client.ts routes subscriptions to the WS link
        ▼
  GraphQLWsLink  →  ws://localhost:3000/api/graphql/ws        ← opens, STAYS OPEN
        │
        ▼  server.ts (WebSocketServer + graphql-ws useServer)
  Subscription.commentAdded
        │  subscribes to the in-memory PubSub and then waits, possibly for hours
        ⋮
        ⋮   ...meanwhile, over on HTTP...
        ⋮
  POST /api/graphql  →  Mutation.addCommentToTask
        │                  writes the row, then pubsub.publish(COMMENT_ADDED)
        ▼
  withFilter drops the event for every subscriber on a different task
        │
        ▼  server pushes down the still-open socket
  Browser: onData → cache.updateQuery appends the comment. No refetch.
```

Read that vertically: the client never asks a second time. The request that
delivers the data was made once, minutes earlier, and the server writes into it
whenever it has something to say.

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

### Team & Activity side

| File | What it does |
|---|---|
| `server.ts` | Custom Node server: Next.js + the WebSocket endpoint in one process |
| `src/server/graphql/schema.ts` | Merges both SDL documents and both resolver maps into one executable schema, shared by HTTP and WS |
| `src/server/graphql/team/typeDefs.ts` | Team/Comment types, `extend type Task`, the connection types, the Subscription |
| `src/server/graphql/team/resolvers.ts` | Pagination, mutations, the subscription, and both the batched and naive comment resolvers |
| `src/server/graphql/team/loaders.ts` | **DataLoader** — the batch function, and why it must be per request |
| `src/server/graphql/team/pubsub.ts` | The in-memory event channel, pinned to `globalThis` so both halves share it |
| `src/lib/apollo/teamOperations.ts` | The team documents, including the shallow/deep pair |
| `src/app/_components/team/` | CreateTeamForm, TeamPicker, AddUserToTeamForm, TeamOverview, PaginatedTaskList, TaskDetail |

### Voice message (self-contained)

A small feature deliberately kept apart from the machinery above: no DataLoader,
no PubSub, no cursors. It demonstrates one thing — **storing a file reference
rather than the file**.

| File | What it does |
|---|---|
| `src/server/storage.ts` | Local stand-in for object storage, plus the long note on why the audio is not in the database |
| `src/app/api/upload/route.ts` | The one endpoint that speaks binary; returns a URL |
| `src/server/graphql/voice/typeDefs.ts` | VoiceMessage type, `extend type Task`, two mutations |
| `src/server/graphql/voice/resolvers.ts` | The upsert, and the ordering rule for row-vs-file writes |
| `src/lib/apollo/voiceOperations.ts` | The voice documents |
| `src/app/_components/team/VoiceMessagePanel.tsx` | Recorder, file upload, `<audio>` player, Remove |

**The audio never travels over GraphQL.** GraphQL carries JSON, so a file would
have to be base64 (a third larger, buffered whole on both ends) or use the
multipart spec (another layer for every client and server in the chain). Instead
the upload is a plain `POST /api/upload` that returns a URL, and
`attachVoiceMessage` takes a `String!`. Two steps:

```
1.  browser → POST /api/upload        (multipart)  → { url, mimeType, sizeBytes }
2.  browser → attachVoiceMessage(taskId, url, …)   → the row
```

In production step 1 becomes a signed URL and the browser PUTs straight to
S3/R2, so the bytes never pass through the API at all. Step 2 does not change —
which is exactly why the two are split.

**Why only the reference is persisted.** Blobs in rows bloat every backup and
replica sync, evict the pages queries actually need from the database's working
set, and turn a static asset into application load — where object storage gives
you CDN delivery and range requests (what `<audio>` needs in order to seek) for
free. So the table keeps the URL plus the metadata worth having without fetching
the audio: duration, mime type, size, upload time.

**The cost:** a row and a file are two systems with no transaction spanning
them. The resolver therefore writes the row first and deletes the old file
second — a failed delete leaks bytes, while a failed write would leave a URL
pointing at nothing and a broken player for every viewer. Given the choice,
leak the bytes and reconcile later.

## The three GraphQL techniques in this tab

**Nested queries at two depths.** `TeamPicker.tsx` asks `team(id) { id name }`;
`TeamOverview.tsx` asks the same field four levels deep, down to each task's
comments and their authors. One field, two callers, two very different amounts
of server work — and the shallow one never touches the Comment table.

**DataLoader.** `Task.comments` goes through a per-request loader that collects
every task id queued in one tick of the event loop and issues a single
`WHERE taskId IN (...)`. `Task.commentsNaive` does the same job without
batching. Both log to the server terminal, so the difference is measurable
rather than theoretical:

```
[DataLoader] batch #1: 1 query for 4 task(s) → WHERE taskId IN (4 ids)
```
```
[N+1] query #1 for task cm...   [N+1] query #2 for task cm...
[N+1] query #3 for task cm...   [N+1] query #4 for task cm...
```

**Cursor pagination.** `tasksConnection` returns Relay-style edges with opaque
base64 cursors. Offset pagination (`skip: 20`) measures against a result set
that moves while you read it: an insert above your position shows you a
duplicate, a delete silently skips a row. A cursor anchors on a ROW, so
concurrent writes elsewhere cannot shift it — and `WHERE id > ?` on an index
stays fast at page 10,000 where `OFFSET 100000` does not.

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

### Team & Activity side

10. Open the app in two browser windows, select the same task in both, and post
    a comment in one. It appears in the other with no refetch and no reload —
    and the Network tab shows no new request, because the data arrived down the
    socket that was already open.
11. Run these two in the Apollo Sandbox and compare the server terminal:

    ```
    { tasksConnection(first: 10) { edges { node { comments { id } } } } }
    { tasksConnection(first: 10) { edges { node { commentsNaive { id } } } } }
    ```

    Same result, one query versus N. Then set Prisma's log to `["query"]` and
    look at the SQL: `WHERE taskId IN (?,?,?,?)` against four separate SELECTs.
12. Delete `resolve: (payload) => payload` from `Subscription.commentAdded` in
    `team/resolvers.ts`. The event still fires — you can see it arrive — but the
    payload comes back as `Cannot return null for non-nullable field`. The
    default resolver looks for `payload.commentAdded`, and our payload is the
    comment itself. This one is worth breaking on purpose; it is the most
    confusing five minutes in a first subscription.
13. Move `createLoaders(...)` out of `createGraphQLContext()` and into a
    module-level constant. Everything still works — until you add a comment and
    reload, and the loader serves you its cached copy of the thread from before
    the write. A request-scoped cache that escapes its request is a data bug
    that looks like a caching feature.
14. Remove `"teamId"` from the `keyArgs` in the `relayStylePagination` policy in
    `client.ts`, then switch teams and click Load more. One team's tasks get
    appended onto another's, because the cache now believes both filters address
    the same list.
15. Kill the server and watch the browser console: `graphql-ws` retries the
    connection. Restart it and the subscription reattaches — but comments posted
    while it was down never arrive. A subscription is a live feed, not a durable
    queue; if gaps matter, refetch on reconnect.

### Voice message

16. Attach a voice message, then attach another one. Watch `public/uploads/`:
    the file count stays at one and the row keeps the same id. That is the
    `upsert` on the unique `taskId` — attach and replace are one operation
    because the relation is 1-1.
17. In `voice/resolvers.ts`, move `deleteStoredFile(previous.url)` to BEFORE the
    upsert, then make the upsert fail (pass a bad `taskId`). You now have a row
    pointing at a file that no longer exists, and a player that renders a 404.
    Put it back and the worst case is an unreferenced file instead. Ordering is
    the entire safety argument when two systems have no shared transaction.
18. Upload something that is not audio (`curl -F "file=@package.json;type=application/json"`)
    → `Unsupported audio type`. The stored filename is generated too, never
    taken from the client: a client-supplied name is a client-supplied path.
