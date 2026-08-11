"use client";

/**
 * TASK DETAIL — the live comment thread
 *
 * This component is where the subscription earns its keep. Open the app in two
 * browser windows, select the same task in both, and post a comment in one:
 * it appears in the other immediately, with no refetch, no polling and no
 * page reload.
 *
 * THE THREE PIECES
 *
 *   useQuery        → the thread as it stands right now (HTTP, one response)
 *   useMutation     → posting a comment                 (HTTP, one response)
 *   useSubscription → everything that happens next      (WebSocket, forever)
 *
 * Note what is NOT here: `refetchQueries` on the mutation. Posting a comment
 * publishes an event that comes straight back down the socket to every
 * listener — including the author. The writer's own UI updates through exactly
 * the same path as everyone else's, which means there is only one code path to
 * get right instead of two.
 *
 * The tradeoff is honest: if the socket is down, the author's comment saves
 * but does not appear until something refetches. A production app would either
 * keep a refetch as a fallback or write the mutation result into the cache
 * directly and let the subscription deduplicate.
 */

import { useState } from "react";
import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { VoiceMessagePanel } from "~/app/_components/team/VoiceMessagePanel";
import { GET_USERS } from "~/lib/apollo/operations";
import {
  ADD_COMMENT_TO_TASK,
  COMMENT_ADDED_SUBSCRIPTION,
  GET_TASK_WITH_COMMENTS,
} from "~/lib/apollo/teamOperations";
import type {
  AddCommentToTaskMutation,
  AddCommentToTaskMutationVariables,
  CommentAddedSubscription,
  CommentAddedSubscriptionVariables,
  GetTaskWithCommentsQuery,
  GetTaskWithCommentsQueryVariables,
  GetUsersQuery,
} from "~/lib/apollo/generated/graphql";

export function TaskDetail({ taskId }: { taskId: string }) {
  const [authorId, setAuthorId] = useState("");
  const [content, setContent] = useState("");
  const [liveCount, setLiveCount] = useState(0);

  const usersQuery = useQuery<GetUsersQuery>(GET_USERS);

  const taskQuery = useQuery<
    GetTaskWithCommentsQuery,
    GetTaskWithCommentsQueryVariables
  >(GET_TASK_WITH_COMMENTS, { variables: { id: taskId } });

  /**
   * THE SUBSCRIPTION.
   *
   * Same hook shape as useQuery, completely different lifecycle: it opens a
   * WebSocket on mount, stays open, and calls `onData` every time the server
   * pushes. Unmount the component and the socket is torn down — the server
   * logs "[ws] client disconnected".
   *
   * `variables.taskId` is sent once, at subscribe time, and the SERVER filters
   * on it (see withFilter in team/resolvers.ts). This is not a client-side
   * filter over a firehose; events for other tasks never reach this browser.
   */
  useSubscription<CommentAddedSubscription, CommentAddedSubscriptionVariables>(
    COMMENT_ADDED_SUBSCRIPTION,
    {
      variables: { taskId },
      onData: ({ client, data }) => {
        const comment = data.data?.commentAdded;
        if (!comment) return;

        /**
         * A subscription payload is NOT automatically merged into a query's
         * result. Apollo will normalize the Comment object itself, but it has
         * no way to know this comment belongs in THAT task's `comments` array
         * — the relationship exists in our heads and in the database, not in
         * the response.
         *
         * So we write it in by hand. `updateQuery` reads the cached result for
         * a specific query + variables, hands it to us, and stores whatever we
         * return.
         */
        client.cache.updateQuery<
          GetTaskWithCommentsQuery,
          GetTaskWithCommentsQueryVariables
        >(
          { query: GET_TASK_WITH_COMMENTS, variables: { id: taskId } },
          (existing) => {
            if (!existing?.task) return existing;

            // Idempotency matters: reconnects can redeliver, and the author's
            // own comment could also arrive through a refetch. Keying on id
            // makes a duplicate event a no-op instead of a duplicate row.
            if (existing.task.comments.some((c) => c.id === comment.id)) {
              return existing;
            }

            return {
              ...existing,
              task: {
                ...existing.task,
                comments: [...existing.task.comments, comment],
              },
            };
          },
        );

        setLiveCount((n) => n + 1);
      },
    },
  );

  const [addComment, { loading: posting, error: postError, reset }] =
    useMutation<AddCommentToTaskMutation, AddCommentToTaskMutationVariables>(
      ADD_COMMENT_TO_TASK,
    );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!authorId || !content.trim()) return;

    try {
      await addComment({ variables: { taskId, authorId, content } });
      setContent("");
    } catch {
      // Surfaced through `postError` below.
    }
  }

  if (taskQuery.loading) {
    return <p className="py-4 text-sm text-slate-500">Loading task...</p>;
  }

  const task = taskQuery.data?.task;
  if (!task) {
    return <p className="py-4 text-sm text-slate-500">Task not found.</p>;
  }

  const users = usersQuery.data?.users ?? [];

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="font-semibold">{task.name}</h3>
        <p className="text-sm text-slate-500">{task.description}</p>
        <p className="mt-1 text-xs text-slate-400">
          Live via WebSocket · {liveCount} event(s) received this session
        </p>
      </div>

      <div>
        <h4 className="text-sm font-medium text-slate-700">
          Comments ({task.comments.length})
        </h4>

        {task.comments.length === 0 ? (
          <p className="text-sm text-slate-500">
            No comments yet. Post the first one.
          </p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {task.comments.map((comment) => (
              <li key={comment.id} className="rounded-lg bg-slate-50 p-2">
                <p className="text-sm">{comment.content}</p>
                <p className="text-xs text-slate-500">
                  {comment.author.name} ·{" "}
                  {new Date(comment.createdAt).toLocaleTimeString("en-GB")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        Self-contained: it runs its own query and its own mutations, and shares
        nothing with the comment thread above. Delete this one line and the
        voice feature disappears from the UI without touching anything else.
      */}
      <VoiceMessagePanel taskId={taskId} />

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-slate-100 pt-3">
        <select
          value={authorId}
          onChange={(e) => {
            setAuthorId(e.target.value);
            if (postError) reset();
          }}
          aria-label="Comment author"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        >
          <option value="">
            {users.length === 0 ? "No users available" : "Comment as..."}
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="Write a comment..."
          aria-label="Comment content"
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />

        {postError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {postError.message}
          </p>
        )}

        <button
          type="submit"
          disabled={posting || !authorId || !content.trim()}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {posting ? "Posting..." : "Post comment"}
        </button>

        <p className="text-xs text-slate-400">
          Open this page in a second window on the same task — a comment posted
          in either appears in both, pushed over the socket rather than
          refetched.
        </p>
      </form>
    </section>
  );
}
