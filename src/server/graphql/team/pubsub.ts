/**
 * PUBSUB — the channel between a mutation and a subscription
 *
 * `addCommentToTask` runs inside a Next.js route handler. `commentAdded` runs
 * inside the WebSocket server in server.ts. For the subscription to fire, the
 * mutation's `publish()` and the subscription's listener must be talking to
 * THE SAME PubSub object.
 *
 * WHY globalThis, AND NOT JUST A MODULE-LEVEL CONST
 *
 * Both halves live in one Node process, but not in one module registry. Next.js
 * compiles route handlers into a webpack bundle with its own copy of the module
 * graph, while server.ts is loaded by Node/tsx directly. Import this file from
 * both sides and you get TWO PubSub instances — the mutation publishes into one
 * and the subscription listens to the other, so nothing ever arrives. The
 * symptom is maddening: no error, no warning, just a subscription that stays
 * silent forever.
 *
 * Pinning the instance to `globalThis` sidesteps the module registry entirely,
 * because there is only one global object per process. This is the same trick
 * `src/server/db.ts` uses to keep one Prisma client across dev-mode reloads —
 * different problem, same escape hatch.
 *
 * PRODUCTION CAVEAT: an in-memory PubSub only reaches subscribers in its own
 * process. Run two instances behind a load balancer and a comment published on
 * box A never reaches a listener connected to box B. The standard fix is a
 * shared broker — graphql-redis-subscriptions and friends — which implements
 * this same interface over Redis. In-memory is correct for a single-process
 * app and for learning; it is not a scaling story.
 */

import { PubSub } from "graphql-subscriptions";

/** Event name. Kept in one place so publisher and subscriber cannot drift. */
export const COMMENT_ADDED = "COMMENT_ADDED";

/** The payload shape carried on that channel. */
export type CommentAddedPayload = {
  [COMMENT_ADDED]: {
    id: string;
    content: string;
    createdAt: Date;
    taskId: string;
    authorId: string;
  };
};

const globalForPubSub = globalThis as unknown as {
  pubsub: PubSub<CommentAddedPayload> | undefined;
};

export const pubsub =
  globalForPubSub.pubsub ?? new PubSub<CommentAddedPayload>();

globalForPubSub.pubsub = pubsub;
