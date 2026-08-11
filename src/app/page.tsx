"use client";

/**
 * HOME PAGE — the shell hosting both features
 *
 * Two tabs, one piece of state, no routing. Deliberately: the point of this
 * page is to put a tRPC feature and a GraphQL feature side by side, and a
 * router would add moving parts that teach nothing about either.
 *
 *   Todos           → tRPC     → /api/trpc       → React Query cache
 *   Task Assignment → GraphQL  → /api/graphql    → Apollo InMemoryCache
 *   Team & Activity → GraphQL  → /api/graphql    → Apollo InMemoryCache
 *                              + /api/graphql/ws → live comments over WebSocket
 *
 * Both hit the same SQLite file through the same Prisma client. Everything
 * above the database is separate.
 *
 * Note that switching tabs UNMOUNTS the other tab's components. Their caches
 * survive (both providers live up in layout.tsx), so coming back is instant
 * rather than a cold load — a good way to watch each cache behave.
 */

import { useState } from "react";
import { TodosTab } from "~/app/_components/TodosTab";
import { TaskAssignmentTab } from "~/app/_components/TaskAssignmentTab";
import { TeamActivityTab } from "~/app/_components/TeamActivityTab";

const TABS = [
  { id: "todos", label: "Todos", api: "tRPC" },
  { id: "tasks", label: "Task Assignment", api: "GraphQL" },
  { id: "team", label: "Team & Activity", api: "GraphQL + WS" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>("todos");

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold">tRPC + GraphQL playground</h1>
        <p className="text-sm text-slate-500">
          One Next.js app, one database, three API surfaces side by side
        </p>
      </header>

      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.label}
            <span
              className={`ml-2 text-xs font-normal ${
                activeTab === tab.id ? "text-slate-300" : "text-slate-400"
              }`}
            >
              {tab.api}
            </span>
          </button>
        ))}
      </div>

      {activeTab === "todos" && <TodosTab />}
      {activeTab === "tasks" && <TaskAssignmentTab />}
      {activeTab === "team" && <TeamActivityTab />}
    </main>
  );
}
