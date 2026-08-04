"use client";

/**
 * TODOS TAB — the original tRPC feature, unchanged.
 *
 * This is exactly what `page.tsx` rendered before the Task Assignment feature
 * was added; it simply moved into a component so the page could host tabs.
 * Nothing about the tRPC data flow changed: TodoForm, TodoFilter and TodoList
 * are the same files, still talking to `/api/trpc`, still using React Query's
 * cache. They know nothing about Apollo.
 */

import { useState } from "react";
import { TodoForm } from "~/app/_components/TodoForm";
import { TodoList } from "~/app/_components/TodoList";
import { TodoFilter, type FilterValue } from "~/app/_components/TodoFilter";

export function TodosTab() {
  const [filter, setFilter] = useState<FilterValue>("all");

  return (
    <div className="space-y-4">
      <TodoForm />
      <TodoFilter value={filter} onChange={setFilter} />
      <TodoList filter={filter} />
    </div>
  );
}
