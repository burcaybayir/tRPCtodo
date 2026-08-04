"use client";

/**
 * ASSIGNMENTS TABLE — current task/user pairs, with an unassign action
 *
 * Note where the data comes from: GET_TASKS, the same document the task list
 * uses. There is no dedicated "assignments" query, because in GraphQL the
 * assignment is not a separate entity — it is the `Task.user` edge. Filtering
 * for tasks whose `user` is non-null IS the list of assignments.
 */

import { useMutation, useQuery } from "@apollo/client/react";
import { GET_TASKS, GET_USERS, UNASSIGN_TASK } from "~/lib/apollo/operations";
import type {
  GetTasksQuery,
  UnassignTaskMutation,
  UnassignTaskMutationVariables,
} from "~/lib/apollo/generated/graphql";

export function AssignmentsTable() {
  const { data, loading } = useQuery<GetTasksQuery>(GET_TASKS);

  const [unassignTask, { loading: unassigning, error }] = useMutation<
    UnassignTaskMutation,
    UnassignTaskMutationVariables
  >(UNASSIGN_TASK, {
    // Same asymmetry as in AssignTaskForm: the returned Task patches itself in
    // the cache, but `User.task` on the other side stays stale until refetched.
    refetchQueries: [{ query: GET_USERS }],
    awaitRefetchQueries: true,
  });

  const assignments = (data?.tasks ?? []).filter((task) => task.user !== null);

  if (loading) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">Loading...</p>
    );
  }

  if (assignments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
        No assignments yet. Create a user and a task, then link them above.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          {/*
            No `uppercase` utility here on purpose. The document is <html
            lang="tr">, and CSS text-transform follows the document language:
            Turkish casing maps "i" to "İ", so "Assigned to" would render as
            "ASSİGNED TO". Writing the label in the case you want avoids the
            whole class of locale-dependent text-transform bugs.
          */}
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Task</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Assigned to</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {assignments.map((task) => (
              <tr key={task.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  <span className="font-medium">{task.name}</span>
                  {task.description && (
                    <span className="block text-xs text-slate-500">
                      {task.description}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {task.type}
                  </span>
                </td>
                {/*
                  TypeScript cannot see that `.filter()` above removed the nulls,
                  so the non-null assertion is doing real work here — the
                  alternative is a `task.user?.name ?? ""` that implies a case
                  the filter already excluded.
                */}
                <td className="px-4 py-2">{task.user!.name}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() =>
                      unassignTask({ variables: { taskId: task.id } }).catch(
                        () => {
                          // Surfaced through `error` above.
                        },
                      )
                    }
                    disabled={unassigning}
                    className="rounded-lg px-2 py-1 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Unassign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
