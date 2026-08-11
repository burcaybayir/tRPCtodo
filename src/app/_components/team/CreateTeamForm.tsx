"use client";

/**
 * CREATE TEAM FORM
 *
 * The plainest mutation in the feature — kept simple so the interesting parts
 * (pagination, subscriptions, DataLoader) stand out elsewhere.
 */

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { CREATE_TEAM, GET_TEAMS } from "~/lib/apollo/teamOperations";
import type {
  CreateTeamMutation,
  CreateTeamMutationVariables,
} from "~/lib/apollo/generated/graphql";

export function CreateTeamForm({
  onCreated,
}: {
  onCreated: (teamId: string) => void;
}) {
  const [name, setName] = useState("");

  const [createTeam, { loading, error, reset }] = useMutation<
    CreateTeamMutation,
    CreateTeamMutationVariables
  >(CREATE_TEAM, {
    // A new team means the teams list grew — the normalized cache can patch
    // objects it knows, but it cannot know a list should gain a member.
    refetchQueries: [{ query: GET_TEAMS }],
    awaitRefetchQueries: true,
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      const result = await createTeam({ variables: { name } });
      setName("");

      // Select the team we just made, so the rest of the tab has something to
      // show without an extra click.
      if (result.data?.createTeam.id) onCreated(result.data.createTeam.id);
    } catch {
      // Surfaced through `error` below.
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex-1">
        <label htmlFor="team-name" className="mb-1 block text-sm font-medium">
          New team
        </label>
        <input
          id="team-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) reset();
          }}
          placeholder="Platform"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {error.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 h-10 shrink-0 rounded-lg bg-slate-900 px-4 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
