"use client";

/**
 * ADD USER TO TEAM
 *
 * Reuses GET_USERS from the Task Assignment feature — the same document, the
 * same cache entry, no second request. Two features sharing one query is free
 * here precisely because Apollo dedupes by document plus variables.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { GET_USERS } from "~/lib/apollo/operations";
import {
  ADD_USER_TO_TEAM,
  GET_TEAM_DEEP,
  GET_TEAMS,
} from "~/lib/apollo/teamOperations";
import type {
  AddUserToTeamMutation,
  AddUserToTeamMutationVariables,
  GetUsersQuery,
} from "~/lib/apollo/generated/graphql";

export function AddUserToTeamForm({ teamId }: { teamId: string }) {
  const [userId, setUserId] = useState("");

  const usersQuery = useQuery<GetUsersQuery>(GET_USERS);

  const [addUserToTeam, { loading, error, reset }] = useMutation<
    AddUserToTeamMutation,
    AddUserToTeamMutationVariables
  >(ADD_USER_TO_TEAM, {
    /**
     * The mutation returns the user with their new team, so `User:<id>` is
     * patched automatically. What is NOT patched is `Team.users` — the same
     * inverse-relation blind spot as in the Task Assignment tab. The cache
     * holds no rule saying "if a user's team changes, that team's user list
     * changed too", because the schema never states such a rule exists.
     *
     * Hence the refetch of the deep team query.
     */
    refetchQueries: [
      { query: GET_TEAM_DEEP, variables: { id: teamId } },
      { query: GET_TEAMS },
    ],
    awaitRefetchQueries: true,
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;

    try {
      await addUserToTeam({ variables: { userId, teamId } });
      setUserId("");
    } catch {
      // Surfaced through `error` below.
    }
  }

  const users = usersQuery.data?.users ?? [];

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="font-semibold">Add a member</h3>

      <select
        value={userId}
        onChange={(e) => {
          setUserId(e.target.value);
          if (error) reset();
        }}
        aria-label="User to add to the team"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
      >
        <option value="">
          {users.length === 0
            ? "No users — create one in the Task Assignment tab"
            : "Select a user..."}
        </option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !userId}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {loading ? "Adding..." : "Add to team"}
      </button>
    </form>
  );
}
