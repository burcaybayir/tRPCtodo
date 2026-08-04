"use client";

/**
 * TASK ASSIGNMENT TAB — the GraphQL half of the app
 *
 * Every component below talks to `/api/graphql` through Apollo. None of them
 * imports anything from `~/lib/trpc` or `~/server/trpc`. The two features share
 * a database, a Prisma client and a page — and nothing else.
 */

import { CreateUserForm } from "~/app/_components/task/CreateUserForm";
import { CreateTaskForm } from "~/app/_components/task/CreateTaskForm";
import { AssignTaskForm } from "~/app/_components/task/AssignTaskForm";
import { EntityLists } from "~/app/_components/task/EntityLists";
import { AssignmentsTable } from "~/app/_components/task/AssignmentsTable";

export function TaskAssignmentTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <CreateUserForm />
        <CreateTaskForm />
      </div>

      <AssignTaskForm />

      <EntityLists />

      <section className="space-y-2">
        <h3 className="font-semibold">Current assignments</h3>
        <AssignmentsTable />
      </section>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
        Explore this API interactively at{" "}
        <a
          href="/api/graphql"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          /api/graphql
        </a>{" "}
        — introspection gives you the full schema, autocomplete and inline docs.
        The tRPC API next door has no such page: it exists only as TypeScript
        types, with nothing to introspect at runtime.
      </p>
    </div>
  );
}
