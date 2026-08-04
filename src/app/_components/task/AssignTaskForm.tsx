"use client";

/**
 * ASSIGN TASK FORM — the one-to-one relation, from the client side
 *
 * This is where the two halves meet: two queries feed the dropdowns, and one
 * mutation links the chosen pair.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  ASSIGN_TASK_TO_USER,
  GET_TASKS,
  GET_USERS,
} from "~/lib/apollo/operations";
import type {
  AssignTaskToUserMutation,
  AssignTaskToUserMutationVariables,
  GetTasksQuery,
  GetUsersQuery,
} from "~/lib/apollo/generated/graphql";

export function AssignTaskForm() {
  const [taskId, setTaskId] = useState("");
  const [userId, setUserId] = useState("");

  /**
   * useQuery runs on mount and re-renders on every cache change, exactly like
   * tRPC's useQuery. The differences are in what you hand it and what you get:
   *
   *   tRPC:    trpc.todo.list.useQuery({ completed })
   *              → input is a plain object; the RESULT SHAPE is fixed by the
   *                server, and the return type is inferred with zero setup.
   *
   *   Apollo:  useQuery<GetUsersQuery>(GET_USERS)
   *              → input is a GraphQL document that also declares which fields
   *                come back, and the type comes from a generated file we had
   *                to produce with `npm run codegen`.
   *
   * Both share one cache-key insight: two components calling the same query
   * with the same variables share one cache entry and one network request.
   *
   * Both queries below are ALSO used by the lists and the table further down
   * the page. They fire once, not three times.
   */
  const usersQuery = useQuery<GetUsersQuery>(GET_USERS);
  const tasksQuery = useQuery<GetTasksQuery>(GET_TASKS);

  const [assignTask, { loading, error, reset }] = useMutation<
    AssignTaskToUserMutation,
    AssignTaskToUserMutationVariables
  >(ASSIGN_TASK_TO_USER, {
    /**
     * WHY REFETCH GET_USERS BUT NOT GET_TASKS?
     *
     * The mutation returns the updated Task including `user { id name }`.
     * Apollo sees `Task:<id>` — an object already in its normalized cache —
     * and patches it in place. The tasks list and the assignments table both
     * update instantly, with no network request. That is the normalized cache
     * earning its keep, and it has no equivalent in React Query.
     *
     * But the INVERSE side of the relation is a different object. `User:<id>`
     * has a `task` field that the cache still believes is null, and nothing in
     * this mutation's response says otherwise. GraphQL has no notion that
     * `User.task` and `Task.user` are two views of one relation — that is a
     * database concept, invisible to the schema.
     *
     * So: the cache handles the half it can see, and we refetch the half it
     * cannot. Comment out the line below, assign a task, and watch the users
     * list keep claiming "no task assigned" while the table right beside it
     * shows the assignment. That divergence is the lesson.
     */
    refetchQueries: [{ query: GET_USERS }],
    awaitRefetchQueries: true,
  });

  const users = usersQuery.data?.users ?? [];
  const tasks = tasksQuery.data?.tasks ?? [];

  // Filter the dropdowns down to valid choices. This is a convenience, NOT the
  // enforcement — the resolver still rejects an illegal pair, because a stale
  // page or a direct API call can always send one anyway. Client-side
  // filtering shapes the happy path; the server owns the invariant.
  const unassignedTasks = tasks.filter((task) => task.user === null);
  const availableUsers = users.filter((user) => user.task === null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!taskId || !userId) return;

    try {
      await assignTask({ variables: { taskId, userId } });
      setTaskId("");
      setUserId("");
    } catch {
      // Surfaced through `error` below — most usefully when the server rejects
      // the pair with TASK_ALREADY_ASSIGNED or USER_ALREADY_HAS_TASK.
    }
  }

  const isLoading = usersQuery.loading || tasksQuery.loading;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="font-semibold">Assign a task</h3>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          <div>
            <label
              htmlFor="assign-task"
              className="mb-1 block text-sm font-medium"
            >
              Unassigned task
            </label>
            <select
              id="assign-task"
              value={taskId}
              onChange={(e) => {
                setTaskId(e.target.value);
                if (error) reset();
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
            >
              <option value="">
                {unassignedTasks.length === 0
                  ? "No unassigned tasks"
                  : "Select a task..."}
              </option>
              {unassignedTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name} ({task.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="assign-user"
              className="mb-1 block text-sm font-medium"
            >
              Available user
            </label>
            <select
              id="assign-user"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                if (error) reset();
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
            >
              <option value="">
                {availableUsers.length === 0
                  ? "No available users"
                  : "Select a user..."}
              </option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !taskId || !userId}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {loading ? "Assigning..." : "Assign"}
      </button>
    </form>
  );
}
