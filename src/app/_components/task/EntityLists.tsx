"use client";

/**
 * USERS AND TASKS LISTS
 *
 * Two read-only lists side by side. Both call useQuery for documents that are
 * already in flight from AssignTaskForm — and both get their data from the
 * cache rather than from a second network request.
 *
 * Open the Network tab and add a user: you will see ONE GetUsers request, not
 * two, even though two components ask for it. Apollo dedupes by document plus
 * variables, exactly as React Query dedupes by query key.
 */

import { useQuery } from "@apollo/client/react";
import { GET_TASKS, GET_USERS } from "~/lib/apollo/operations";
import type {
  GetTasksQuery,
  GetUsersQuery,
} from "~/lib/apollo/generated/graphql";

export function EntityLists() {
  const usersQuery = useQuery<GetUsersQuery>(GET_USERS);
  const tasksQuery = useQuery<GetTasksQuery>(GET_TASKS);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 font-semibold">
          Users{" "}
          <span className="text-sm font-normal text-slate-400">
            ({usersQuery.data?.users.length ?? 0})
          </span>
        </h3>

        {usersQuery.loading && (
          <p className="text-sm text-slate-500">Loading...</p>
        )}

        {/*
          A GraphQL response can be PARTIALLY successful: some fields resolve
          while others error, so `data` and `error` can both be present. Here
          we render whatever data arrived and show the error alongside it,
          rather than treating an error as "nothing to display".
        */}
        {usersQuery.error && (
          <p className="text-sm text-red-700">{usersQuery.error.message}</p>
        )}

        <ul className="space-y-1.5">
          {usersQuery.data?.users.map((user) => (
            <li key={user.id} className="text-sm">
              <span className="font-medium">{user.name}</span>
              <span className="text-slate-400"> · {user.age}</span>
              <span className="block text-xs text-slate-500">
                {/*
                  `user.task` is typed `{ ... } | null` in the generated types
                  because the SDL declares `task: Task` without a "!". The type
                  system forces this null check — the schema's nullability
                  travelled all the way into TypeScript.
                */}
                {user.task
                  ? `${user.task.name} (${user.task.type})`
                  : "no task assigned"}
              </span>
            </li>
          ))}
        </ul>

        {usersQuery.data?.users.length === 0 && (
          <p className="text-sm text-slate-500">No users yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 font-semibold">
          Tasks{" "}
          <span className="text-sm font-normal text-slate-400">
            ({tasksQuery.data?.tasks.length ?? 0})
          </span>
        </h3>

        {tasksQuery.loading && (
          <p className="text-sm text-slate-500">Loading...</p>
        )}

        {tasksQuery.error && (
          <p className="text-sm text-red-700">{tasksQuery.error.message}</p>
        )}

        <ul className="space-y-1.5">
          {tasksQuery.data?.tasks.map((task) => (
            <li key={task.id} className="text-sm">
              <span className="font-medium">{task.name}</span>
              <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {task.type}
              </span>
              <span className="block text-xs text-slate-500">
                {task.user ? `assigned to ${task.user.name}` : "unassigned"}
              </span>
            </li>
          ))}
        </ul>

        {tasksQuery.data?.tasks.length === 0 && (
          <p className="text-sm text-slate-500">No tasks yet.</p>
        )}
      </section>
    </div>
  );
}
