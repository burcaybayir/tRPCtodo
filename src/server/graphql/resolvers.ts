/**
 * RESOLVERS
 *
 * A resolver map mirrors the schema: for every type and field the SDL declares,
 * there may be a function here that produces its value. Fields with no resolver
 * fall back to "read the property of the same name off the parent object".
 *
 * HOW THIS DIFFERS FROM A tRPC PROCEDURE
 *
 *   tRPC:    one procedure = one endpoint. It runs once, returns a whole
 *            object, and that object is what the client gets. The shape is
 *            fixed by the server.
 *
 *   GraphQL: one query = MANY resolvers, called in a tree. The client picks
 *            which fields it wants, and only the resolvers for those fields
 *            run. Asking for `users { name }` never touches the `task`
 *            resolver; asking for `users { name task { id } }` does.
 *
 * That per-field laziness is GraphQL's core advantage — and the direct cause of
 * the N+1 problem documented at the bottom of this file.
 *
 * Every resolver receives four positional arguments:
 *   (parent, args, context, info)
 *    parent  — the value the PARENT field resolved to (the User row, etc.)
 *    args    — the field's arguments, already type-checked against the SDL
 *    context — our { db }, built per request in context.ts
 *    info    — the AST of the current query; rarely needed by hand
 */

import { GraphQLError } from "graphql";
import type { Task, User } from "@prisma/client";
import type { GraphQLContext } from "~/server/graphql/context";

/**
 * Small helper so every "missing row" error looks the same.
 *
 * `extensions.code` is the GraphQL convention for a machine-readable error
 * code — it is the counterpart of tRPC's `TRPCError({ code: "NOT_FOUND" })`.
 * The client reads it from `error.graphQLErrors[0].extensions.code`.
 */
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, {
    extensions: { code: "NOT_FOUND" },
  });
}

export const resolvers = {
  Query: {
    users: (_parent: unknown, _args: unknown, ctx: GraphQLContext) =>
      ctx.db.user.findMany({ orderBy: { name: "asc" } }),

    tasks: (_parent: unknown, _args: unknown, ctx: GraphQLContext) =>
      ctx.db.task.findMany({ orderBy: { name: "asc" } }),

    // Returns null when absent rather than throwing: the SDL declares
    // `user(id: ID!): User` WITHOUT a `!` on the return type, so null is a
    // legal, expected answer here.
    user: (_parent: unknown, args: { id: string }, ctx: GraphQLContext) =>
      ctx.db.user.findUnique({ where: { id: args.id } }),

    task: (_parent: unknown, args: { id: string }, ctx: GraphQLContext) =>
      ctx.db.task.findUnique({ where: { id: args.id } }),
  },

  Mutation: {
    createUser: async (
      _parent: unknown,
      args: { name: string; age: number },
      ctx: GraphQLContext,
    ) => {
      // The SDL guarantees `name` is a String and `age` is an Int — but NOT
      // that the string is non-empty or the number is sane. GraphQL's type
      // system has no equivalent of Zod's `.min(1)`, so value-level rules are
      // hand-written here. (On the tRPC side, `.input(zodSchema)` covers this
      // before the resolver ever runs.)
      const name = args.name.trim();

      if (name.length === 0) {
        throw new GraphQLError("Name is required", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (!Number.isInteger(args.age) || args.age < 0 || args.age > 150) {
        throw new GraphQLError("Age must be an integer between 0 and 150", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return ctx.db.user.create({ data: { name, age: args.age } });
    },

    createTask: async (
      _parent: unknown,
      args: { name: string; description: string; type: string },
      ctx: GraphQLContext,
    ) => {
      const name = args.name.trim();
      const description = args.description.trim();
      const type = args.type.trim();

      if (name.length === 0) {
        throw new GraphQLError("Task name is required", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (type.length === 0) {
        throw new GraphQLError("Task type is required", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      // Tasks are always created unassigned; linking is a separate, explicit
      // mutation. Keeping "create" and "assign" apart means the one-to-one
      // rule lives in exactly one place.
      return ctx.db.task.create({ data: { name, description, type } });
    },

    /**
     * assignTaskToUser — the one-to-one invariant lives here.
     *
     * Two ways this relation can be violated, and both are checked:
     *   1. the task is already held by someone
     *   2. the user already holds some other task
     *
     * The database's `@unique` on `Task.userId` would also catch case 2, but it
     * would surface as an opaque Prisma P2002 error. Checking first lets us
     * return a message a human can act on.
     *
     * Honest caveat: read-then-write is not atomic. Two simultaneous requests
     * could both pass the checks and then race. The unique constraint is what
     * actually keeps the data correct — these checks only make the common case
     * produce a good error message. A production version would wrap this in
     * `ctx.db.$transaction(...)` and translate P2002 as the fallback.
     */
    assignTaskToUser: async (
      _parent: unknown,
      args: { taskId: string; userId: string },
      ctx: GraphQLContext,
    ) => {
      const task = await ctx.db.task.findUnique({ where: { id: args.taskId } });
      if (!task) notFound("Task");

      if (task.userId !== null) {
        throw new GraphQLError("This task is already assigned to a user", {
          extensions: { code: "TASK_ALREADY_ASSIGNED" },
        });
      }

      // `include: { task: true }` pulls the user's current task in the same
      // query, so we can check the other half of the invariant without a
      // second round trip.
      const user = await ctx.db.user.findUnique({
        where: { id: args.userId },
        include: { task: true },
      });
      if (!user) notFound("User");

      if (user.task !== null) {
        throw new GraphQLError("This user already has a task assigned", {
          extensions: { code: "USER_ALREADY_HAS_TASK" },
        });
      }

      return ctx.db.task.update({
        where: { id: args.taskId },
        data: { userId: args.userId },
      });
    },

    unassignTask: async (
      _parent: unknown,
      args: { taskId: string },
      ctx: GraphQLContext,
    ) => {
      const task = await ctx.db.task.findUnique({ where: { id: args.taskId } });
      if (!task) notFound("Task");

      // Idempotent: unassigning an already-free task is a no-op, not an error.
      // Setting the foreign key to null is the entire "unlink" operation.
      return ctx.db.task.update({
        where: { id: args.taskId },
        data: { userId: null },
      });
    },
  },

  /**
   * FIELD RESOLVERS
   *
   * Everything above resolves a root field. The two maps below resolve fields
   * *on a type*, and they only run when the client actually asks for them.
   *
   * `parent` here is the row the enclosing resolver returned — a User row for
   * `User.task`, a Task row for `Task.user`.
   *
   * tRPC has no equivalent concept. If a tRPC procedure wanted to return users
   * with their tasks, it would decide up front:
   *     db.user.findMany({ include: { task: true } })
   * one query, always, whether the caller needs tasks or not. GraphQL defers
   * the decision to the caller — which is the feature, and the problem.
   */
  User: {
    task: (parent: User, _args: unknown, ctx: GraphQLContext) =>
      ctx.db.task.findUnique({ where: { userId: parent.id } }),
  },

  Task: {
    user: (parent: Task, _args: unknown, ctx: GraphQLContext) => {
      // Short-circuit: no foreign key means no user, and no reason to query.
      if (parent.userId === null) return null;

      return ctx.db.user.findUnique({ where: { id: parent.userId } });
    },
  },
};

/**
 * ---------------------------------------------------------------------------
 * THE N+1 PROBLEM — and why it does NOT appear here
 * ---------------------------------------------------------------------------
 *
 * The textbook warning about the two field resolvers above goes like this:
 *
 *     query { users { id name task { id name } } }
 *
 *     1  query   →  Query.users   (SELECT * FROM User)
 *     N  queries →  User.task, once per user returned
 *
 * One query for the list, N more for the children: N+1. It is the most common
 * way a GraphQL API falls over in production, and GraphQL's per-field
 * resolution is what invites it — `User.task` really does run once per row.
 *
 * BUT MEASURE BEFORE YOU BELIEVE IT. With Prisma's query log enabled (it is,
 * in src/server/db.ts), run the query above with four users and read the SQL:
 *
 *     SELECT ... FROM `Task` WHERE `Task`.`userId` IN (?,?,?,?)
 *
 * One query, not four. Prisma Client has its own batching layer: `findUnique`
 * calls issued during the same tick of the event loop, against the same model
 * with the same selection, are coalesced into a single `IN (...)` query. The
 * resolver is still invoked N times; the database is hit once.
 *
 * This is measurable, not theoretical. Swap `findUnique` for `findFirst` in
 * the `User.task` resolver above and the same request produces four separate
 * Task queries — because `findFirst` can express conditions a batched `IN`
 * cannot, so Prisma does not batch it. Swap it back: one query again.
 *
 * WHEN YOU STILL NEED DATALOADER
 *
 * Prisma's batching is narrow. It covers `findUnique` and nothing else, so
 * N+1 returns the moment a resolver needs:
 *   - `findMany` for a to-many relation (a user's many tasks)
 *   - `findFirst`, or any query with ordering or extra filters
 *   - an aggregate, a count, or a call to some non-Prisma service
 *
 * DataLoader (https://github.com/graphql/dataloader) is the general answer. It
 * collects the keys requested during one tick and fires one batched query for
 * all of them — the same trick, but under your control and not limited to a
 * single Prisma method:
 *
 *     // in context.ts — a fresh loader per request, never shared between them
 *     const tasksByUserId = new DataLoader<string, Task[]>(async (userIds) => {
 *       const tasks = await db.task.findMany({
 *         where: { userId: { in: [...userIds] } },
 *         orderBy: { name: "asc" },
 *       });
 *       const grouped = new Map<string, Task[]>();
 *       for (const task of tasks) {
 *         if (task.userId) {
 *           grouped.set(task.userId, [...(grouped.get(task.userId) ?? []), task]);
 *         }
 *       }
 *       // Contract: one entry per key, in the SAME order as `userIds`.
 *       return userIds.map((id) => grouped.get(id) ?? []);
 *     });
 *
 *     // in this file
 *     User: {
 *       tasks: (parent, _args, ctx) => ctx.loaders.tasksByUserId.load(parent.id),
 *     }
 *
 * Two rules that matter: build loaders inside `createGraphQLContext()` so each
 * request gets its own — a shared loader would leak one request's cached rows
 * into another's — and always return exactly one result per key in input
 * order, or results land on the wrong parents.
 *
 * The takeaway is not "GraphQL is slow" or "Prisma fixed it". It is that
 * GraphQL moves the query-planning decision from the server to the caller, so
 * you have to look at the SQL your resolvers actually emit. A tRPC procedure
 * has one shape and one query plan you can read straight from the code; a
 * GraphQL field has as many plans as there are ways to ask for it.
 */
