"use client";

/**
 * TEAM OVERVIEW — the DEEP caller of `team(id)`
 *
 * The counterpart to TeamPicker.tsx. Same field, four levels of nesting:
 *
 *     team(id) {
 *       name
 *       users { name age }
 *       tasks { name comments { content author { name } } }
 *     }
 *
 * One HTTP request returns the entire activity tree. The equivalent REST
 * sequence is a waterfall whose length depends on the data — fetch the team,
 * then its users, then its tasks, then one comments request per task, each
 * round trip waiting on the one before it.
 *
 * Watch the server terminal while this loads. You will see exactly one
 * DataLoader line:
 *
 *     [DataLoader] batch #1: 1 query for N task(s) → WHERE taskId IN (N ids)
 *
 * The comments for every task in the team arrive in a single query. Switch the
 * document to `commentsNaive` and the same screen logs one line per task
 * instead — same pixels, N times the database work.
 */

import { useQuery } from "@apollo/client/react";
import { GET_TEAM_DEEP } from "~/lib/apollo/teamOperations";
import type {
  GetTeamDeepQuery,
  GetTeamDeepQueryVariables,
} from "~/lib/apollo/generated/graphql";

export function TeamOverview({ teamId }: { teamId: string }) {
  const { data, loading, error } = useQuery<
    GetTeamDeepQuery,
    GetTeamDeepQueryVariables
  >(GET_TEAM_DEEP, { variables: { id: teamId } });

  if (loading) {
    return <p className="py-4 text-sm text-slate-500">Loading team...</p>;
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error.message}
      </p>
    );
  }

  const team = data?.team;
  if (!team) return null;

  const totalComments = team.tasks.reduce(
    (sum, task) => sum + task.comments.length,
    0,
  );

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="font-semibold">{team.name} — activity</h3>
        <p className="text-xs text-slate-500">
          {team.users.length} member(s), {team.tasks.length} task(s),{" "}
          {totalComments} comment(s) — all from one request, four levels deep.
        </p>
      </div>

      <div>
        <h4 className="text-sm font-medium text-slate-700">Members</h4>
        {team.users.length === 0 ? (
          <p className="text-sm text-slate-500">No members yet.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {team.users.map((user) => (
              <li
                key={user.id}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
              >
                {user.name} · {user.age}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium text-slate-700">
          Tasks and their comment threads
        </h4>
        {team.tasks.length === 0 ? (
          <p className="text-sm text-slate-500">
            No tasks on this team yet. Assign one below.
          </p>
        ) : (
          <ul className="mt-1 space-y-2">
            {team.tasks.map((task) => (
              <li key={task.id} className="rounded-lg bg-slate-50 p-2">
                <p className="text-sm font-medium">
                  {task.name}
                  <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs font-normal text-slate-600">
                    {task.type}
                  </span>
                </p>

                {task.comments.length === 0 ? (
                  <p className="text-xs text-slate-400">no comments</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {task.comments.map((comment) => (
                      <li key={comment.id} className="text-xs text-slate-600">
                        <span className="font-medium">
                          {comment.author.name}:
                        </span>{" "}
                        {comment.content}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
