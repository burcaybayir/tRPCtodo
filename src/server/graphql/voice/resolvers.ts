/**
 * VOICE MESSAGE RESOLVERS
 *
 * Four small resolvers, no shared state with the team feature: no DataLoader,
 * no PubSub, no cursors. A 1-1 relation fetched one task at a time does not
 * need batching, and nobody is waiting on a socket for an audio file.
 *
 * The one thing worth studying here is what happens when a database row and a
 * stored file have to change together — see the note in `replaceOldFile`.
 */

import { GraphQLError } from "graphql";
import type { Task, VoiceMessage } from "@prisma/client";
import type { GraphQLContext } from "~/server/graphql/context";
import { deleteStoredFile } from "~/server/storage";

function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, {
    extensions: { code: "NOT_FOUND" },
  });
}

export const voiceResolvers = {
  Mutation: {
    attachVoiceMessage: async (
      _p: unknown,
      args: {
        taskId: string;
        url: string;
        duration?: number | null;
        mimeType?: string | null;
        sizeBytes?: number | null;
      },
      ctx: GraphQLContext,
    ) => {
      const url = args.url.trim();

      if (url.length === 0) {
        throw new GraphQLError("A file URL is required", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      // Checked explicitly so the caller gets "Task not found" rather than a
      // raw Prisma foreign-key violation from inside the upsert.
      const task = await ctx.db.task.findUnique({
        where: { id: args.taskId },
        include: { voiceMessage: true },
      });
      if (!task) notFound("Task");

      const previous = task.voiceMessage;

      /**
       * UPSERT ON THE UNIQUE FOREIGN KEY.
       *
       * `taskId` carries @unique, which is what makes it usable as the `where`
       * of an upsert. One statement covers both cases:
       *
       *   no row yet   → create
       *   row exists   → update it in place, keeping the same id
       *
       * The alternative — findUnique, then branch to create or update — is two
       * round trips with a race in the middle: two concurrent attaches can
       * both see "no row" and both try to create, and the second gets a unique
       * constraint violation. The upsert pushes that decision into the
       * database, where it is atomic.
       */
      const voiceMessage = await ctx.db.voiceMessage.upsert({
        where: { taskId: args.taskId },
        create: {
          taskId: args.taskId,
          url,
          duration: args.duration ?? null,
          sizeBytes: args.sizeBytes ?? null,
          // `?? undefined` rather than `?? null`: undefined lets Prisma apply
          // the schema default ("audio/webm"), null would violate the
          // non-nullable column.
          mimeType: args.mimeType ?? undefined,
        },
        update: {
          url,
          duration: args.duration ?? null,
          sizeBytes: args.sizeBytes ?? null,
          mimeType: args.mimeType ?? undefined,
          uploadedAt: new Date(),
        },
      });

      /**
       * Delete the replaced file AFTER the row is safely updated.
       *
       * Order matters and only one order is safe. Delete the file first and a
       * failed update leaves the row pointing at a file that no longer exists —
       * a broken player for every viewer. Update first and a failed delete
       * leaves an unreferenced file on disk, which costs storage and nothing
       * else. Given a choice between broken data and wasted bytes, leak the
       * bytes.
       *
       * Not awaited-and-checked for the same reason: `deleteStoredFile` never
       * throws, and cleanup must not be able to fail the user's action.
       */
      if (previous && previous.url !== url) {
        await deleteStoredFile(previous.url);
      }

      return voiceMessage;
    },

    removeVoiceMessage: async (
      _p: unknown,
      args: { taskId: string },
      ctx: GraphQLContext,
    ): Promise<boolean> => {
      const task = await ctx.db.task.findUnique({
        where: { id: args.taskId },
        include: { voiceMessage: true },
      });
      if (!task) notFound("Task");

      // Idempotent: nothing attached means the caller's goal is already met.
      // Returning false rather than throwing lets a client call this without
      // first checking, which is usually what you want from a "remove".
      if (!task.voiceMessage) return false;

      await ctx.db.voiceMessage.delete({ where: { taskId: args.taskId } });

      // Row first, file second — same ordering argument as above.
      await deleteStoredFile(task.voiceMessage.url);

      return true;
    },
  },

  Task: {
    /**
     * Resolved per task, deliberately unbatched.
     *
     * The UI asks for this on ONE task at a time (the detail panel), so there
     * is never a list of ids to batch and a DataLoader would buy nothing. If
     * this field were ever added to a list query — showing a mic icon on every
     * row, say — it would become an N+1 immediately and want a loader of its
     * own. Batch the fields that appear under a list; this one does not.
     */
    voiceMessage: (parent: Task, _a: unknown, ctx: GraphQLContext) =>
      ctx.db.voiceMessage.findUnique({ where: { taskId: parent.id } }),
  },

  VoiceMessage: {
    // Date in the database, String in the schema.
    uploadedAt: (parent: VoiceMessage) => parent.uploadedAt.toISOString(),
  },
};
