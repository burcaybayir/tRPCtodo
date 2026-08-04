"use client";

/**
 * CREATE TASK FORM
 *
 * Same shape as CreateUserForm — see that file for the detailed notes on
 * useMutation and refetchQueries. This one exists to show a mutation with
 * three arguments, and validation the schema cannot express.
 */

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { CREATE_TASK, GET_TASKS } from "~/lib/apollo/operations";
import type {
  CreateTaskMutation,
  CreateTaskMutationVariables,
} from "~/lib/apollo/generated/graphql";

/**
 * The SDL types this field as `String!`, so the schema accepts any string at
 * all. These suggestions live in the UI only — which is exactly the gap a
 * GraphQL `enum TaskType { BUG FEATURE CHORE }` would close, by making an
 * invalid type a schema error instead of a bad row in the database.
 */
const TASK_TYPES = ["bug", "feature", "chore", "research"];

export function CreateTaskForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState(TASK_TYPES[0]);

  const [createTask, { loading, error, reset }] = useMutation<
    CreateTaskMutation,
    CreateTaskMutationVariables
  >(CREATE_TASK, {
    // A new task changes the tasks list only — users are untouched, so there
    // is no reason to refetch GET_USERS here. Refetching precisely what
    // changed is the habit worth building.
    refetchQueries: [{ query: GET_TASKS }],
    awaitRefetchQueries: true,
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      await createTask({ variables: { name, description, type } });
      setName("");
      setDescription("");
      setType(TASK_TYPES[0]);
    } catch {
      // Surfaced through `error` below.
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="font-semibold">Create task</h3>

      <div>
        <label htmlFor="task-name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="task-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) reset();
          }}
          placeholder="Fix the login redirect"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label
          htmlFor="task-description"
          className="mb-1 block text-sm font-medium"
        >
          Description
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What needs to happen?"
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label htmlFor="task-type" className="mb-1 block text-sm font-medium">
          Type
        </label>
        <select
          id="task-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
        >
          {TASK_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

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
        {loading ? "Creating..." : "Create task"}
      </button>
    </form>
  );
}
