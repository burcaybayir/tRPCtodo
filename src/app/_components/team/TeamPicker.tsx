"use client";

/**
 * TEAM PICKER — the SHALLOW caller of `team(id)`
 *
 * Read this file together with TeamOverview.tsx. Both call the same server
 * field. This one asks for two scalars:
 *
 *     team(id) { id name }
 *
 * and therefore triggers exactly one SELECT on the Team table. The `users` and
 * `tasks` resolvers never run; the Comment table is never opened.
 *
 * That is the whole over-fetching argument made concrete. A REST endpoint has
 * to decide up front how much of the team to serialize, and whatever it picks
 * is wrong for somebody — too little for the overview panel, far too much for
 * this header. Here the same field serves both, and the server's workload is
 * whatever each caller wrote down.
 */

import { useQuery } from "@apollo/client/react";
import { GET_TEAMS, GET_TEAM_SHALLOW } from "~/lib/apollo/teamOperations";
import type {
  GetTeamShallowQuery,
  GetTeamShallowQueryVariables,
  GetTeamsQuery,
} from "~/lib/apollo/generated/graphql";

export function TeamPicker({
  selectedTeamId,
  onSelect,
}: {
  selectedTeamId: string | null;
  onSelect: (teamId: string | null) => void;
}) {
  const teamsQuery = useQuery<GetTeamsQuery>(GET_TEAMS);

  /**
   * `skip` stops the query from running while there is nothing to ask about.
   * Without it, Apollo would fire `team(id: "")` on first render and get a
   * null back — a wasted round trip on every mount.
   */
  const selectedTeam = useQuery<
    GetTeamShallowQuery,
    GetTeamShallowQueryVariables
  >(GET_TEAM_SHALLOW, {
    variables: { id: selectedTeamId ?? "" },
    skip: !selectedTeamId,
  });

  const teams = teamsQuery.data?.teams ?? [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label htmlFor="team-select" className="mb-1 block text-sm font-medium">
        Team
      </label>

      <select
        id="team-select"
        value={selectedTeamId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
      >
        <option value="">
          {teams.length === 0 ? "No teams yet" : "Select a team..."}
        </option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>

      {selectedTeam.data?.team && (
        <p className="mt-2 text-xs text-slate-500">
          Viewing{" "}
          <span className="font-medium text-slate-700">
            {selectedTeam.data.team.name}
          </span>{" "}
          — this header was fetched with{" "}
          <code className="rounded bg-slate-100 px-1">team(id) &#123; id name &#125;</code>,
          two fields and nothing else.
        </p>
      )}
    </div>
  );
}
