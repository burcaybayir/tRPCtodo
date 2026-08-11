"use client";

/**
 * TEAM & ACTIVITY TAB
 *
 * The third API surface in the app, and the one that uses the parts of GraphQL
 * the first two had no reason to touch:
 *
 *   nested queries → TeamPicker and TeamOverview call the SAME `team(id)` field
 *                    at two depths, and the server does correspondingly
 *                    different work
 *   DataLoader     → TeamOverview's comment threads arrive in one batched query
 *                    instead of one per task
 *   pagination     → PaginatedTaskList walks the task list by cursor
 *   subscriptions  → TaskDetail receives comments pushed over a WebSocket
 *
 * Like the other two tabs, it shares only the database with them.
 */

import { useState } from "react";
import { CreateTeamForm } from "~/app/_components/team/CreateTeamForm";
import { TeamPicker } from "~/app/_components/team/TeamPicker";
import { AddUserToTeamForm } from "~/app/_components/team/AddUserToTeamForm";
import { TeamOverview } from "~/app/_components/team/TeamOverview";
import { PaginatedTaskList } from "~/app/_components/team/PaginatedTaskList";
import { TaskDetail } from "~/app/_components/team/TaskDetail";

export function TeamActivityTab() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <CreateTeamForm onCreated={setTeamId} />
        <TeamPicker selectedTeamId={teamId} onSelect={setTeamId} />
      </div>

      {teamId && (
        <>
          <AddUserToTeamForm teamId={teamId} />
          <TeamOverview teamId={teamId} />
        </>
      )}

      <section className="space-y-2">
        <h3 className="font-semibold">
          All tasks{" "}
          <span className="text-sm font-normal text-slate-400">
            cursor-paginated
          </span>
        </h3>
        <PaginatedTaskList
          teamId={teamId}
          selectedTaskId={taskId}
          onSelectTask={setTaskId}
        />
      </section>

      {taskId ? (
        <TaskDetail taskId={taskId} />
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
          Select a task above to open its live comment thread.
        </p>
      )}

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
        Watch the server terminal while you use this tab. Loading a team logs one{" "}
        <code>[DataLoader] batch</code> line covering every task at once; the
        WebSocket logs <code>[ws] client connected</code> when a task thread
        opens.
      </p>
    </div>
  );
}
