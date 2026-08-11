/**
 * TEAM & ACTIVITY RESOLVERS
 *
 * Merged with the Task Assignment resolvers at startup (see schema.ts). Both
 * files contribute fields to `Task`; neither has to know about the other.
 *
 * Three things here that the earlier features had no reason to show:
 *   - a DataLoader-backed field resolver     (Task.comments)
 *   - cursor-based pagination                (Query.tasksConnection)
 *   - a subscription                         (Subscription.commentAdded)
 */

import { GraphQLError } from "graphql";
import { withFilter } from "graphql-subscriptions";
import type { Comment, Task, Team, User } from "@prisma/client";
import type { GraphQLContext } from "~/server/graphql/context";
import { COMMENT_ADDED, pubsub } from "~/server/graphql/team/pubsub";

function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, {
    extensions: { code: "NOT_FOUND" },
  });
}

/**
 * CURSOR ENCODING
 *
 * The cursor is deliberately opaque: base64 of the row id. Not for security —
 * anyone can decode base64 — but to stop clients from PARSING it. The moment a
 * client discovers the cursor is "just the id" it will start constructing
 * cursors itself, and you can never change your pagination strategy again.
 * An opaque string keeps the door open to switching to a compound
 * (createdAt, id) cursor later without breaking a single caller.
 */
function encodeCursor(id: string): string {
  return Buffer.from(`task:${id}`, "utf8").toString("base64");
}

function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, "base64").toString("utf8");

  if (!decoded.startsWith("task:")) {
    throw new GraphQLError("Malformed cursor", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return decoded.slice("task:".length);
}

export const teamResolvers = {
  Query: {
    teams: (_p: unknown, _a: unknown, ctx: GraphQLContext) =>
      ctx.db.team.findMany({ orderBy: { name: "asc" } }),

    team: (_p: unknown, args: { id: string }, ctx: GraphQLContext) =>
      ctx.db.team.findUnique({ where: { id: args.id } }),

    /**
     * CURSOR-BASED PAGINATION
     *
     * WHY NOT OFFSET (`skip: 20, take: 10`)?
     *
     * Offset pagination asks "skip the first N rows". The problem is that N is
     * measured against the result set AS IT IS RIGHT NOW, and the result set
     * moves between page loads:
     *
     *   page 1 → rows 1-10
     *   ...someone inserts a row that sorts above row 1...
     *   page 2 → skip 10, take 10
     *
     * The old row 10 has been pushed to position 11, so it appears on page 2
     * as well — the user sees a duplicate. A deletion causes the mirror image:
     * a row silently skipped and never shown. Neither is a rare race; on an
     * active list it happens constantly.
     *
     * A cursor says "start after THIS row" instead of "skip this many rows".
     * Inserts and deletes elsewhere in the list cannot shift the anchor,
     * because the anchor is a row, not a count. The page you get is consistent
     * with the page you asked for.
     *
     * The performance argument is the same shape. `OFFSET 100000` makes the
     * database walk and discard 100,000 rows before returning anything; the
     * deeper the page the slower it gets. `WHERE id > ?` with an index is a
     * seek — page 10,000 costs the same as page 1.
     *
     * THE ORDERING REQUIREMENT
     *
     * A cursor only identifies a position if the sort key is UNIQUE and
     * STABLE. Sorting by `name` would break the moment two tasks share a name:
     * "start after the row named 'Fix login'" is ambiguous, and rows get
     * skipped or repeated at the boundary. So this orders by `id` — unique by
     * construction. Real systems that want a friendlier order use a compound
     * key (`ORDER BY createdAt, id`) precisely to restore uniqueness.
     */
    tasksConnection: async (
      _p: unknown,
      args: {
        teamId?: string | null;
        type?: string | null;
        first?: number | null;
        after?: string | null;
      },
      ctx: GraphQLContext,
    ) => {
      // Clamp the page size. An unbounded `first` lets any caller ask for the
      // entire table in one request — the most common way a paginated API is
      // accidentally not paginated.
      const first = Math.min(Math.max(args.first ?? 5, 1), 50);

      const where = {
        // `undefined` drops the condition entirely; `null` would search for
        // NULL. The distinction matters here because "no team filter" and
        // "tasks with no team" are different questions.
        teamId: args.teamId ?? undefined,
        type: args.type ?? undefined,
      };

      // Fetch one MORE row than requested. If it comes back, there is a next
      // page — this avoids a second COUNT query just to answer hasNextPage.
      const rows = await ctx.db.task.findMany({
        where,
        orderBy: { id: "asc" },
        take: first + 1,
        // `cursor` positions the query AT that row, so `skip: 1` steps past it
        // — the caller already has it.
        ...(args.after
          ? { cursor: { id: decodeCursor(args.after) }, skip: 1 }
          : {}),
      });

      const hasNextPage = rows.length > first;
      const nodes = hasNextPage ? rows.slice(0, first) : rows;

      // totalCount is a separate query on purpose. It is genuinely useful for
      // a "42 tasks" label, but it is also the expensive part of this
      // resolver — and because it is its own field, a client that does not ask
      // for it does not pay for it. That is the point of field-level
      // resolution.
      const totalCount = await ctx.db.task.count({ where });

      return {
        edges: nodes.map((node) => ({ cursor: encodeCursor(node.id), node })),
        pageInfo: {
          hasNextPage,
          endCursor:
            nodes.length > 0 ? encodeCursor(nodes[nodes.length - 1].id) : null,
        },
        totalCount,
      };
    },
  },

  Mutation: {
    createTeam: async (
      _p: unknown,
      args: { name: string },
      ctx: GraphQLContext,
    ) => {
      const name = args.name.trim();

      if (name.length === 0) {
        throw new GraphQLError("Team name is required", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return ctx.db.team.create({ data: { name } });
    },

    addUserToTeam: async (
      _p: unknown,
      args: { userId: string; teamId: string },
      ctx: GraphQLContext,
    ) => {
      const team = await ctx.db.team.findUnique({ where: { id: args.teamId } });
      if (!team) notFound("Team");

      const user = await ctx.db.user.findUnique({ where: { id: args.userId } });
      if (!user) notFound("User");

      // No uniqueness check needed, unlike assignTaskToUser in the Task
      // Assignment feature: this is 1-N, so a team can hold any number of
      // users. Moving a user who is already on another team just overwrites
      // the foreign key.
      return ctx.db.user.update({
        where: { id: args.userId },
        data: { teamId: args.teamId },
      });
    },

    addTaskToTeam: async (
      _p: unknown,
      args: { taskId: string; teamId?: string | null },
      ctx: GraphQLContext,
    ) => {
      const task = await ctx.db.task.findUnique({ where: { id: args.taskId } });
      if (!task) notFound("Task");

      if (args.teamId) {
        const team = await ctx.db.team.findUnique({
          where: { id: args.teamId },
        });
        if (!team) notFound("Team");
      }

      // A null teamId is a legitimate instruction here ("remove from team"),
      // which is why this passes `?? null` rather than the `?? undefined`
      // used for filters elsewhere. Same operator, opposite intent.
      return ctx.db.task.update({
        where: { id: args.taskId },
        data: { teamId: args.teamId ?? null },
      });
    },

    addCommentToTask: async (
      _p: unknown,
      args: { taskId: string; authorId: string; content: string },
      ctx: GraphQLContext,
    ) => {
      const content = args.content.trim();

      if (content.length === 0) {
        throw new GraphQLError("Comment cannot be empty", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const task = await ctx.db.task.findUnique({ where: { id: args.taskId } });
      if (!task) notFound("Task");

      const author = await ctx.db.user.findUnique({
        where: { id: args.authorId },
      });
      if (!author) notFound("User");

      const comment = await ctx.db.comment.create({
        data: { content, taskId: args.taskId, authorId: args.authorId },
      });

      /**
       * Publish AFTER the write commits, never before.
       *
       * Subscribers receive this and immediately render it as fact. Publishing
       * optimistically — before the insert, or inside a transaction that might
       * still roll back — shows every listener a comment that may not exist.
       * The rule: the event announces something that already happened.
       */
      await pubsub.publish(COMMENT_ADDED, comment);

      return comment;
    },
  },

  Subscription: {
    /**
     * A subscription resolver is shaped differently from a query resolver: it
     * returns `{ subscribe, resolve }` rather than a value.
     *
     *   subscribe → returns an async iterator. GraphQL pulls from it forever,
     *               emitting one response per yielded value.
     *   resolve   → maps each yielded payload into the field's type.
     *
     * `resolve` IS REQUIRED HERE, and leaving it out is the classic first
     * mistake. Each value yielded by `subscribe` becomes the SOURCE object for
     * the field, and the default resolver then reads `source[fieldName]` — it
     * goes looking for `payload.commentAdded`. Our payload is the Comment row
     * itself, with no such key, so the default resolver returns undefined and
     * the response is:
     *
     *     Cannot return null for non-nullable field Subscription.commentAdded.
     *
     * Confusing, because the event clearly fired and the data clearly exists.
     * The identity function below is what maps "the thing I published" onto
     * "the thing this field returns". Publishing `{ commentAdded: comment }`
     * instead would also work — same fix, other end.
     *
     * `withFilter` wraps the iterator so each subscriber only sees the events
     * they care about. Note WHERE the filtering happens: on the server, per
     * event, per connection. Every listener on every task is woken for each
     * published comment and then filtered out. That is fine for a handful of
     * subscribers and wasteful for thousands — at which point you publish to a
     * per-task channel (`COMMENT_ADDED:${taskId}`) instead, so the broker does
     * the routing and idle subscribers are never woken at all.
     */
    commentAdded: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator(COMMENT_ADDED),
        // Both parameters are typed optional by graphql-subscriptions, because
        // the filter also runs for protocol-level events that carry no
        // payload. Returning false for those is correct: nothing to deliver.
        (payload?: Comment, variables?: { taskId: string }) =>
          payload?.taskId === variables?.taskId && payload !== undefined,
      ),

      resolve: (payload: Comment) => payload,
    },
  },

  Team: {
    users: (parent: Team, _a: unknown, ctx: GraphQLContext) =>
      ctx.db.user.findMany({
        where: { teamId: parent.id },
        orderBy: { name: "asc" },
      }),

    tasks: (parent: Team, _a: unknown, ctx: GraphQLContext) =>
      ctx.db.task.findMany({
        where: { teamId: parent.id },
        orderBy: { name: "asc" },
      }),
  },

  Task: {
    /**
     * THE BATCHED VERSION.
     *
     * `.load()` queues the id and returns a Promise. Every sibling task's
     * `comments` field queues into the same batch, and one query serves them
     * all. Watch the server terminal:
     *
     *     [DataLoader] batch #1: 1 query for 4 task(s) → WHERE taskId IN (4 ids)
     *
     * One line. Four tasks.
     */
    comments: (parent: Task, _a: unknown, ctx: GraphQLContext) =>
      ctx.loaders.commentsByTaskId.load(parent.id),

    /**
     * THE N+1 VERSION — for comparison only, never used by the UI.
     *
     * Identical intent, no queue: each task fires its own query the instant
     * its resolver runs. The same request now logs:
     *
     *     [N+1] query #1 for task cm...a
     *     [N+1] query #2 for task cm...b
     *     [N+1] query #3 for task cm...c
     *     [N+1] query #4 for task cm...d
     *
     * Four lines. Four tasks. The gap is 4 queries versus 1 at four rows, and
     * 400 versus 1 at four hundred — the cost grows with the data while the
     * batched version stays flat. Nothing about the query text is wrong here;
     * the defect is purely in how many times it runs.
     *
     * Try both in the Apollo Sandbox at /api/graphql and watch the terminal:
     *
     *     { tasksConnection(first: 10) { edges { node { comments { id } } } } }
     *     { tasksConnection(first: 10) { edges { node { commentsNaive { id } } } } }
     *
     * Note that Prisma's automatic findUnique batching — the thing that
     * quietly rescued `User.task` in the Task Assignment feature — does not
     * help at all here. That batching only covers `findUnique`, and a
     * one-to-many child list needs `findMany`. This is exactly the case the
     * note at the bottom of the other resolvers file warned about, which is
     * why DataLoader is not optional this time.
     */
    commentsNaive: async (
      parent: Task,
      _a: unknown,
      ctx: GraphQLContext,
    ): Promise<Comment[]> => {
      ctx.queryCounter.count += 1;

      console.log(
        `[N+1] query #${ctx.queryCounter.count} for task ${parent.id}`,
      );

      return ctx.db.comment.findMany({
        where: { taskId: parent.id },
        orderBy: { createdAt: "asc" },
      });
    },

    team: (parent: Task, _a: unknown, ctx: GraphQLContext) => {
      if (parent.teamId === null) return null;
      return ctx.db.team.findUnique({ where: { id: parent.teamId } });
    },
  },

  User: {
    team: (parent: User, _a: unknown, ctx: GraphQLContext) => {
      if (parent.teamId === null) return null;
      return ctx.db.team.findUnique({ where: { id: parent.teamId } });
    },

    comments: (parent: User, _a: unknown, ctx: GraphQLContext) =>
      ctx.db.comment.findMany({
        where: { authorId: parent.id },
        orderBy: { createdAt: "desc" },
      }),
  },

  Comment: {
    // `createdAt` is a Date in the database and a String in the schema, so it
    // needs an explicit resolver — the default "read the property" behaviour
    // would hand GraphQL a Date object for a String field.
    createdAt: (parent: Comment) => parent.createdAt.toISOString(),

    author: (parent: Comment, _a: unknown, ctx: GraphQLContext) =>
      ctx.db.user.findUnique({ where: { id: parent.authorId } }),

    task: (parent: Comment, _a: unknown, ctx: GraphQLContext) =>
      ctx.db.task.findUnique({ where: { id: parent.taskId } }),
  },
};
