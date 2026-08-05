"use client";

/**
 * TODO LIST — `useQuery` plus the toggle/delete mutations
 */

import { trpc } from "~/lib/trpc/client";
import type { FilterValue } from "~/app/_components/TodoFilter";

/** Maps the on-screen filter value to the `list` query's input. */
function filterToInput(filter: FilterValue) {
  if (filter === "all") return undefined; // no input → everything
  return { completed: filter === "completed" };
}

export function TodoList({ filter }: { filter: FilterValue }) {
  const utils = trpc.useUtils();

  /**
   * useQuery — READING DATA
   *
   * It takes two arguments: (input, reactQueryOptions)
   *
   * The key insight: THE INPUT IS PART OF THE CACHE KEY.
   * `{ completed: true }` and `undefined` are separate cache entries. Change
   * the filter and React Query fires a request for the new key; switch back to
   * a filter you already viewed and the data comes straight from cache.
   *
   * The fields of the returned object worth knowing:
   *   data       → the data on success (undefined during the first load)
   *   isLoading  → cache empty AND a request in flight (first load)
   *   isFetching → true for every request, including background refreshes
   *   error      → the error object
   */
  const todosQuery = trpc.todo.list.useQuery(filterToInput(filter));

  const toggleTodo = trpc.todo.toggle.useMutation({
    // Flipping the flag affects both the "Completed" and "Active" lists, so we
    // refresh every list variant.
    onSuccess: () => utils.todo.list.invalidate(),
  });

  const deleteTodo = trpc.todo.delete.useMutation({
    onSuccess: () => utils.todo.list.invalidate(),
  });

  // --- State 1: first load ---
  if (todosQuery.isLoading) {
    return <p className="py-8 text-center text-slate-500">Loading...</p>;
  }

  // --- State 2: query error (server down, for instance) ---
  if (todosQuery.error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Could not load todos</p>
        <p>{todosQuery.error.message}</p>
        <button
          onClick={() => todosQuery.refetch()}
          className="mt-2 underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  const todos = todosQuery.data ?? [];

  // --- State 3: empty list ---
  if (todos.length === 0) {
    return (
      <p className="py-8 text-center text-slate-500">
        {filter === "all"
          ? "No todos yet. Add one above."
          : "No todos match this filter."}
      </p>
    );
  }

  // --- State 4: the list ---
  return (
    <ul className="space-y-2">
      {todos.map((todo) => (
        <li
          key={todo.id}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => toggleTodo.mutate({ id: todo.id })}
            disabled={toggleTodo.isPending}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-slate-900"
            aria-label={`Mark ${todo.title} as completed`}
          />

          <div className="min-w-0 flex-1">
            <p
              className={
                todo.completed
                  ? "font-medium text-slate-400 line-through"
                  : "font-medium"
              }
            >
              {todo.title}
            </p>

            {todo.description && (
              <p className="mt-0.5 text-sm text-slate-500">{todo.description}</p>
            )}

            {/*
              Thanks to the superjson transformer, `createdAt` is a real Date
              object on the client — no string parsing required.
            */}
            <p className="mt-1 text-xs text-slate-400">
              {todo.createdAt.toLocaleString("en-GB")}
            </p>
          </div>

          <button
            onClick={() => deleteTodo.mutate({ id: todo.id })}
            disabled={deleteTodo.isPending}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            aria-label={`Delete ${todo.title}`}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
