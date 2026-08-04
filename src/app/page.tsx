"use client";

/**
 * ANA SAYFA
 *
 * Sadece filtre state'ini tutar ve parçaları birleştirir.
 * Veri çekme/yazma işleri ilgili bileşenlerin içinde (TodoForm, TodoList).
 */

import { useState } from "react";
import { TodoForm } from "~/app/_components/TodoForm";
import { TodoList } from "~/app/_components/TodoList";
import { TodoFilter, type FilterValue } from "~/app/_components/TodoFilter";

export default function HomePage() {
  const [filter, setFilter] = useState<FilterValue>("all");

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold">tRPC Todo</h1>
        <p className="text-sm text-slate-500">
          Next.js + tRPC + Zod + Prisma ile uçtan uca tip güvenli todo listesi
        </p>
      </header>

      <TodoForm />
      <TodoFilter value={filter} onChange={setFilter} />
      <TodoList filter={filter} />
    </main>
  );
}
