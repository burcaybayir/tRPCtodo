"use client";

/**
 * ADD TODO FORM — `useMutation` + cache invalidation + error handling
 */

import { useState } from "react";
import { trpc } from "~/lib/trpc/client";
import { createTodoSchema } from "~/server/trpc/schemas/todo";

export function TodoForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  /** CLIENT-SIDE error: what we catch before ever reaching the server. */
  const [clientError, setClientError] = useState<string | null>(null);

  /**
   * useUtils() → the door into React Query's cache.
   * It mirrors the router's shape exactly: utils.todo.list.invalidate(), etc.
   */
  const utils = trpc.useUtils();

  const createTodo = trpc.todo.create.useMutation({
    /**
     * CACHE INVALIDATION — the single most important pattern in tRPC.
     *
     * The problem: the result of the `todo.list` query is sitting in React
     * Query's cache. After adding a todo the cache keeps showing the old list,
     * because React Query has NO WAY to know something changed on the server.
     *
     * The fix: once the mutation succeeds, mark the relevant query stale.
     * React Query then refetches it for every component currently displaying
     * it, and the UI catches up.
     *
     * Choosing the scope (matching works by prefix):
     *   utils.todo.list.invalidate()                    → every list variant
     *                                                     (all filter values)
     *   utils.todo.list.invalidate({ completed: true }) → only that one input
     *   utils.todo.invalidate()                         → the whole todo router
     *   utils.invalidate()                              → everything
     *
     * Here we refresh every variant: a new todo affects both the "All" and the
     * "Active" lists at once.
     */
    onSuccess: async () => {
      await utils.todo.list.invalidate();
      setTitle("");
      setDescription("");
      setClientError(null);
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    /**
     * ERROR HANDLING — LAYER 1 (client)
     * We run the SAME Zod schema the server uses. `safeParse` does not throw;
     * it returns `{ success, error }`. An empty title is caught right here,
     * without spending a network request on it.
     */
    const parsed = createTodoSchema.safeParse({ title, description });

    if (!parsed.success) {
      // flatten().fieldErrors → { title?: string[]; description?: string[] }
      const errors = parsed.error.flatten().fieldErrors;
      setClientError(errors.title?.[0] ?? errors.description?.[0] ?? "Invalid input");
      return;
    }

    setClientError(null);
    createTodo.mutate(parsed.data);
  }

  /**
   * ERROR HANDLING — LAYER 2 (server)
   * Even if the client check is bypassed (calling `mutate` from the console,
   * say), the server still rejects it. That failure arrives in
   * `createTodo.error`.
   *
   * Thanks to the errorFormatter in trpc.ts we also get per-field detail:
   *   error.data.zodError.fieldErrors.title → ["Title is required"]
   * Otherwise we fall back to the generic message.
   */
  const serverError =
    createTodo.error?.data?.zodError?.fieldErrors?.title?.[0] ??
    createTodo.error?.message ??
    null;

  const errorMessage = clientError ?? serverError;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Description <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Add details if you want..."
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        // `isPending` → the mutation is in flight. Prevents double submits.
        disabled={createTodo.isPending}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {createTodo.isPending ? "Adding..." : "Add todo"}
      </button>
    </form>
  );
}
