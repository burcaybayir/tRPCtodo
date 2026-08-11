/**
 * DATALOADER — batching the child queries a GraphQL tree generates
 *
 * HOW THE BATCH FUNCTION ACTUALLY WORKS
 *
 * A DataLoader is a queue with a very specific flush moment. Calling
 * `.load(key)` does NOT hit the database. It:
 *
 *   1. pushes `key` onto an internal queue and hands you back a Promise
 *   2. schedules a flush on `process.nextTick` — that is, at the END of the
 *      current tick of the event loop, once all synchronously-reachable code
 *      has run
 *   3. when the flush fires, calls YOUR batch function once with the whole
 *      array of queued keys
 *   4. resolves each pending Promise from the corresponding slot of the array
 *      your batch function returned
 *
 * Step 2 is the entire trick, and it is why this works with zero cooperation
 * from the resolvers. GraphQL executes all sibling fields of a list in the same
 * tick: for `tasks { comments { ... } }` the executor calls the `comments`
 * resolver for task 1, task 2, task 3... back to back, without awaiting in
 * between. Every one of those calls lands in the same queue, and they all come
 * out as ONE `WHERE taskId IN (?,?,?)` query.
 *
 * THE TWO CONTRACTS YOU MUST HONOUR
 *
 *   a) Return exactly one entry per key. Not "one per row found" — one per KEY.
 *      A task with no comments still needs its slot, holding `[]`.
 *   b) Return them in the SAME ORDER as the keys came in. DataLoader matches
 *      results to callers positionally; get the order wrong and task 1 silently
 *      receives task 3's comments. There is no error, just wrong data.
 *
 * Databases honour neither contract for free — `WHERE id IN (...)` returns
 * matching rows in whatever order it likes and omits misses entirely. So every
 * batch function ends the same way: build a Map from the rows, then map over
 * the keys. That final `keys.map(...)` is not boilerplate; it IS the contract.
 *
 * WHY PER REQUEST, NOT PER PROCESS
 *
 * DataLoader also memoises: load the same key twice and the second call returns
 * the first one's Promise without touching the database. Across a single
 * request that is exactly what you want. Across requests it is a correctness
 * bug — the cache would hand request B rows loaded (and possibly since
 * modified or permission-filtered) during request A. So the loaders are built
 * fresh in `createGraphQLContext()`, once per request, and thrown away with it.
 */

import DataLoader from "dataloader";
import type { Comment, PrismaClient } from "@prisma/client";

/**
 * Counts database round trips for the current request so the effect is
 * visible rather than theoretical. Passed in from the context.
 */
export type QueryCounter = { count: number };

export function createLoaders(db: PrismaClient, counter: QueryCounter) {
  return {
    /**
     * Batches `Task.comments` across every task in the response.
     *
     * Keys are task ids; each result slot is that task's comments.
     */
    commentsByTaskId: new DataLoader<string, Comment[]>(async (taskIds) => {
      counter.count += 1;

      console.log(
        `[DataLoader] batch #${counter.count}: 1 query for ${taskIds.length} task(s) → WHERE taskId IN (${taskIds.length} ids)`,
      );

      const comments = await db.comment.findMany({
        where: { taskId: { in: [...taskIds] } },
        orderBy: { createdAt: "asc" },
      });

      // Group the flat row list by taskId...
      const byTaskId = new Map<string, Comment[]>();
      for (const comment of comments) {
        const bucket = byTaskId.get(comment.taskId);
        if (bucket) bucket.push(comment);
        else byTaskId.set(comment.taskId, [comment]);
      }

      // ...then emit one entry per key, in key order. Tasks with no comments
      // get an empty array — a missing slot would leave their Promise pending
      // forever.
      return taskIds.map((taskId) => byTaskId.get(taskId) ?? []);
    }),

    /**
     * The same pattern for `Team.users` and `Team.tasks` would go here. They
     * are left unbatched because the UI only ever asks for one team at a time,
     * so the batch size would always be 1 — DataLoader costs a little
     * indirection and buys nothing when N is 1.
     *
     * The rule of thumb: batch the fields that appear UNDER a list. A field on
     * a single root object is fetched once no matter what you do.
     */
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
