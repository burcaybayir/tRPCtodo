"use client";

/**
 * TODO LİSTESİ — `useQuery` + toggle/delete mutation'ları
 */

import { trpc } from "~/lib/trpc/client";
import type { FilterValue } from "~/app/_components/TodoFilter";

/** Ekrandaki filtre değerini `list` query'sinin input'una çevirir. */
function filterToInput(filter: FilterValue) {
  if (filter === "all") return undefined; // input yok → hepsi
  return { completed: filter === "completed" };
}

export function TodoList({ filter }: { filter: FilterValue }) {
  const utils = trpc.useUtils();

  /**
   * useQuery — VERİ OKUMA
   *
   * İki argüman alır: (input, reactQueryOptions)
   *
   * Kritik nokta: INPUT, CACHE ANAHTARININ PARÇASIDIR.
   * `{ completed: true }` ile `undefined` ayrı cache girdileridir. Filtreyi
   * değiştirdiğinde React Query yeni anahtar için yeni bir istek atar; daha
   * önce görülen filtreye dönersen cache'ten anında gelir.
   *
   * Dönen nesnenin işimize yarayan alanları:
   *   data      → başarıyla gelen veri (ilk yüklemede undefined)
   *   isLoading → cache boş + istek uçuşta (ilk yükleme)
   *   isFetching→ arka planda tazeleme dahil her istekte true
   *   error     → hata nesnesi
   */
  const todosQuery = trpc.todo.list.useQuery(filterToInput(filter));

  const toggleTodo = trpc.todo.toggle.useMutation({
    // Durum değişince "Tamamlanan"/"Tamamlanmayan" listelerinin ikisi de
    // etkilenir → tüm list varyantlarını tazeliyoruz.
    onSuccess: () => utils.todo.list.invalidate(),
  });

  const deleteTodo = trpc.todo.delete.useMutation({
    onSuccess: () => utils.todo.list.invalidate(),
  });

  // --- Durum 1: ilk yükleme ---
  if (todosQuery.isLoading) {
    return <p className="py-8 text-center text-slate-500">Yükleniyor...</p>;
  }

  // --- Durum 2: query hatası (ör. sunucu kapalı) ---
  if (todosQuery.error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Todo&apos;lar yüklenemedi</p>
        <p>{todosQuery.error.message}</p>
        <button
          onClick={() => todosQuery.refetch()}
          className="mt-2 underline underline-offset-2"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  const todos = todosQuery.data ?? [];

  // --- Durum 3: boş liste ---
  if (todos.length === 0) {
    return (
      <p className="py-8 text-center text-slate-500">
        {filter === "all"
          ? "Henüz todo yok. Yukarıdan ekleyebilirsin."
          : "Bu filtreye uyan todo yok."}
      </p>
    );
  }

  // --- Durum 4: liste ---
  return (
    <ul className="space-y-2">
      {todos.map((todo) => (
        <li
          key={todo.id}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => toggleTodo.mutate({ id: todo.id })}
            disabled={toggleTodo.isPending}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-slate-900"
            aria-label={`${todo.title} tamamlandı olarak işaretle`}
          />

          <div className="min-w-0 flex-1">
            <p
              className={
                todo.completed
                  ? "font-medium text-slate-400 line-through"
                  : "font-medium"
              }
            >
              {todo.title}
            </p>

            {todo.description && (
              <p className="mt-0.5 text-sm text-slate-500">{todo.description}</p>
            )}

            {/*
              superjson transformer sayesinde `createdAt` istemcide gerçek bir
              Date nesnesi — string parse etmek gerekmiyor.
            */}
            <p className="mt-1 text-xs text-slate-400">
              {todo.createdAt.toLocaleString("tr-TR")}
            </p>
          </div>

          <button
            onClick={() => deleteTodo.mutate({ id: todo.id })}
            disabled={deleteTodo.isPending}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            aria-label={`${todo.title} sil`}
          >
            Sil
          </button>
        </li>
      ))}
    </ul>
  );
}
