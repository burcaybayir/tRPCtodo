"use client";

/**
 * CREATE USER FORM — useMutation, and how cache updates differ from tRPC
 */

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { CREATE_USER, GET_USERS } from "~/lib/apollo/operations";
import type {
  CreateUserMutation,
  CreateUserMutationVariables,
} from "~/lib/apollo/generated/graphql";

export function CreateUserForm() {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");

  /**
   * useMutation looks almost identical to tRPC's: it returns a trigger
   * function plus a status object, and it does not run on render.
   *
   *   tRPC:    const m = trpc.todo.create.useMutation();  m.mutate({ title })
   *   Apollo:  const [run, { loading }] = useMutation(DOC); run({ variables })
   *
   * Two surface differences: Apollo returns a TUPLE rather than an object, and
   * arguments go under a `variables` key instead of being passed directly.
   *
   * The real difference is below.
   */
  const [createUser, { loading, error, reset }] = useMutation<
    CreateUserMutation,
    CreateUserMutationVariables
  >(CREATE_USER, {
    /**
     * CACHE INVALIDATION — the GraphQL counterpart of
     * `utils.todo.list.invalidate()` in TodoForm.tsx.
     *
     * Why this is needed at all: Apollo's normalized cache automatically
     * patches objects it already knows. A brand-new user is, by definition,
     * not one of those — and nothing tells the cache that the `users` list
     * should now contain one more entry. So we ask for the list again.
     *
     * The three ways to do this, weakest to strongest:
     *
     *  1. refetchQueries (used here) — re-run the named queries over the
     *     network. Simple and always correct. Costs a round trip.
     *
     *  2. update(cache, { data }) — write the new user into the cached
     *     `users` array by hand. No round trip, but you are now maintaining
     *     a second copy of the server's ordering and filtering logic.
     *
     *  3. cache.evict() / refetchQueries with a broader net — the blunt
     *     instrument, closest in spirit to tRPC's `utils.invalidate()`.
     *
     * COMPARED WITH tRPC: `utils.todo.list.invalidate()` marks the query stale
     * and lets React Query decide whether to refetch — if no component is
     * currently showing that query, nothing happens until one mounts.
     * `refetchQueries` is more literal: it fires the request now, whether or
     * not anything is watching. tRPC's version is lazier and usually cheaper;
     * Apollo's is more predictable.
     *
     * Also note WHAT we name: tRPC invalidates by procedure path
     * (`todo.list`), derived from the router. Apollo refetches by document —
     * we hand it the actual query object. There is no path to reference,
     * because in GraphQL there are no procedures, only documents.
     */
    refetchQueries: [{ query: GET_USERS }],

    // Wait for the refetch to land before `loading` flips back to false, so
    // the new row and the enabled button appear in the same frame.
    awaitRefetchQueries: true,
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      await createUser({
        variables: {
          name,
          // GraphQL's Int is a real integer type — sending "42" as a string is
          // a schema violation, not a coercion the server will forgive.
          age: Number(age),
        },
      });
      setName("");
      setAge("");
    } catch {
      // Swallowed on purpose: the failure is already reflected in `error`
      // below. Without this catch, the rejected promise would surface as an
      // unhandled rejection in the console.
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="font-semibold">Create user</h3>

      <div>
        <label htmlFor="user-name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="user-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) reset();
          }}
          placeholder="Ada Lovelace"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label htmlFor="user-age" className="mb-1 block text-sm font-medium">
          Age
        </label>
        <input
          id="user-age"
          type="number"
          min={0}
          max={150}
          value={age}
          onChange={(e) => {
            setAge(e.target.value);
            if (error) reset();
          }}
          placeholder="36"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      {/*
        ERROR HANDLING
        `error.message` carries the text thrown by `new GraphQLError(...)` in
        the resolver — e.g. "Name is required".

        A GraphQL subtlety worth knowing: a failed mutation still returns HTTP
        200 with an `errors` array in the body. Apollo turns that into this
        `error` object. So "the request succeeded" and "the operation
        succeeded" are genuinely different questions here — network monitoring
        that only watches status codes will report a perfectly healthy API
        while every mutation fails.
      */}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create user"}
      </button>
    </form>
  );
}
