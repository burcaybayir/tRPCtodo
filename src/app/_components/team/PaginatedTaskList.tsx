"use client";

/**
 * CURSOR-PAGINATED TASK LIST
 *
 * Demonstrates `fetchMore` plus the `relayStylePagination` field policy
 * configured in src/lib/apollo/client.ts.
 *
 * THE MECHANICS OF "LOAD MORE"
 *
 *   1. the first render runs the query with `after: null` → page 1
 *   2. the response carries `pageInfo.endCursor` — an opaque pointer to the
 *      last row of that page
 *   3. clicking Load more calls `fetchMore({ variables: { after: endCursor } })`
 *   4. the cache's merge function concatenates the new edges onto the old ones,
 *      so `data` grows rather than being replaced
 *
 * Nothing here counts rows. The client never says "skip 10" — it says "carry on
 * from this row", which is what makes the sequence stable while other people
 * are inserting and deleting tasks underneath it. See the long note on
 * Query.tasksConnection in team/resolvers.ts for why that matters.
 */

import { useMutation, useQuery } from "@apollo/client/react";
import {
  ADD_TASK_TO_TEAM,
  GET_TASKS_CONNECTION,
  GET_TEAM_DEEP,
} from "~/lib/apollo/teamOperations";
import type {
  AddTaskToTeamMutation,
  AddTaskToTeamMutationVariables,
  GetTasksConnectionQuery,
  GetTasksConnectionQueryVariables,
} from "~/lib/apollo/generated/graphql";

const PAGE_SIZE = 3;

export function PaginatedTaskList({
  teamId,
  selectedTaskId,
  onSelectTask,
}: {
  teamId: string | null;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}) {
  const { data, loading, error, fetchMore } = useQuery<
    GetTasksConnectionQuery,
    GetTasksConnectionQueryVariables
  >(GET_TASKS_CONNECTION, {
    // Deliberately NOT filtered by team: this list is how you find a task and
    // put it on a team in the first place. `teamId` stays out of the variables
    // so every task is reachable.
    variables: { first: PAGE_SIZE, after: null },
    // Keeps `loading` accurate while fetchMore is in flight; without it the
    // Load more button cannot show its own pending state.
    notifyOnNetworkStatusChange: true,
  });

  const [addTaskToTeam, { loading: assigning }] = useMutation<
    AddTaskToTeamMutation,
    AddTaskToTeamMutationVariables
  >(ADD_TASK_TO_TEAM, {
    // The mutation returns the task with its new team, so `Task:<id>` patches
    // itself in this list. The team's own `tasks` array is the inverse side and
    // still needs a refetch.
    refetchQueries: teamId
      ? [{ query: GET_TEAM_DEEP, variables: { id: teamId } }]
      : [],
    awaitRefetchQueries: true,
  });

  const connection = data?.tasksConnection;
  const edges = connection?.edges ?? [];

  if (loading && edges.length === 0) {
    return <p className="py-4 text-sm text-slate-500">Loading tasks...</p>;
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error.message}
      </p>
    );
  }

  if (edges.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
        No tasks yet. Create some in the Task Assignment tab.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Showing {edges.length} of {connection?.totalCount ?? 0} — {PAGE_SIZE} per
        page, cursor-based.
      </p>

      <ul className="space-y-1.5">
        {edges.map(({ node, cursor }) => (
          <li
            key={node.id}
            className={`flex items-center gap-2 rounded-xl border bg-white p-3 shadow-sm ${
              selectedTaskId === node.id
                ? "border-slate-900"
                : "border-slate-200"
            }`}
          >
            <button
              onClick={() => onSelectTask(node.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="text-sm font-medium">{node.name}</span>
              <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {node.type}
              </span>
              <span className="block text-xs text-slate-500">
                {node.team ? `team: ${node.team.name}` : "no team"}
                {node.user ? ` · assigned to ${node.user.name}` : ""}
              </span>
              {/*
                The cursor is shown only because this is a teaching app. Notice
                it is base64 and carries no meaning to the client — that opacity
                is intentional, so the server can change its pagination strategy
                later without breaking anyone. Real UIs never render this.
              */}
              <span className="block truncate font-mono text-[10px] text-slate-300">
                cursor: {cursor}
              </span>
            </button>

            {teamId && node.team?.id !== teamId && (
              <button
                onClick={() =>
                  addTaskToTeam({
                    variables: { taskId: node.id, teamId },
                  }).catch(() => {
                    // Non-fatal for this demo; the row simply stays put.
                  })
                }
                disabled={assigning}
                className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs transition hover:bg-slate-50 disabled:opacity-50"
              >
                Add to team
              </button>
            )}
          </li>
        ))}
      </ul>

      {connection?.pageInfo.hasNextPage && (
        <button
          onClick={() =>
            fetchMore({
              // Only `after` changes. `first` stays the same, and teamId/type
              // must not change here — they are keyArgs, and altering them
              // would mean asking for a different list entirely.
              variables: { after: connection.pageInfo.endCursor },
            })
          }
          disabled={loading}
          className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}

      {!connection?.pageInfo.hasNextPage && (
        <p className="text-center text-xs text-slate-400">
          End of list — no cursor to continue from.
        </p>
      )}
    </div>
  );
}
