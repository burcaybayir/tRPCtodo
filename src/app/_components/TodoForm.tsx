"use client";

/**
 * TODO EKLEME FORMU — `useMutation` + cache invalidation + hata yakalama
 */

import { useState } from "react";
import { trpc } from "~/lib/trpc/client";
import { createTodoSchema } from "~/server/trpc/schemas/todo";

export function TodoForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  /** İSTEMCİ TARAFI hata: sunucuya gitmeden yakaladıklarımız */
  const [clientError, setClientError] = useState<string | null>(null);

  /**
   * useUtils() → React Query cache'ine erişim kapısı.
   * Router'ın şeklini birebir taşır: utils.todo.list.invalidate() gibi.
   */
  const utils = trpc.useUtils();

  const createTodo = trpc.todo.create.useMutation({
    /**
     * CACHE INVALIDATION — tRPC'de en kritik kalıp.
     *
     * Sorun: `todo.list` query'sinin sonucu React Query cache'inde duruyor.
     * Yeni bir todo eklediğimizde cache eski listeyi göstermeye devam eder;
     * React Query sunucuda bir şey değiştiğini kendiliğinden BİLEMEZ.
     *
     * Çözüm: mutation başarılı olunca ilgili query'yi "bayat" ilan ederiz.
     * React Query o query'yi ekranda kullanan tüm bileşenler için otomatik
     * yeniden çeker (refetch) ve UI tazelenir.
     *
     * Kapsam seçimi (prefix eşleşmesine göre çalışır):
     *   utils.todo.list.invalidate()                → tüm list varyantları
     *                                                 (her filtre değeri dahil)
     *   utils.todo.list.invalidate({ completed: true }) → sadece o input'lu query
     *   utils.todo.invalidate()                     → todo router'ının tamamı
     *   utils.invalidate()                          → her şey
     *
     * Burada tüm varyantları tazeliyoruz: yeni todo "Tümü" ve "Tamamlanmayan"
     * listelerini birden etkiliyor.
     */
    onSuccess: async () => {
      await utils.todo.list.invalidate();
      setTitle("");
      setDescription("");
      setClientError(null);
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    /**
     * HATA YAKALAMA — 1. KATMAN (istemci)
     * Sunucudaki ile AYNI Zod şemasını burada da çalıştırıyoruz. safeParse
     * exception fırlatmaz, `{ success, error }` döner. Boş title'ı gereksiz
     * bir network isteği yapmadan burada yakalıyoruz.
     */
    const parsed = createTodoSchema.safeParse({ title, description });

    if (!parsed.success) {
      // flatten().fieldErrors → { title?: string[]; description?: string[] }
      const errors = parsed.error.flatten().fieldErrors;
      setClientError(errors.title?.[0] ?? errors.description?.[0] ?? "Geçersiz giriş");
      return;
    }

    setClientError(null);
    createTodo.mutate(parsed.data);
  }

  /**
   * HATA YAKALAMA — 2. KATMAN (sunucu)
   * İstemci doğrulaması atlansa bile (ör. mutate'i konsoldan çağırsan)
   * sunucu yine reddeder. O hata `createTodo.error` içinde gelir.
   *
   * trpc.ts'deki errorFormatter sayesinde alan bazlı detay da var:
   *   error.data.zodError.fieldErrors.title → ["Başlık zorunludur"]
   * Yoksa genel mesaja düşüyoruz.
   */
  const serverError =
    createTodo.error?.data?.zodError?.fieldErrors?.title?.[0] ??
    createTodo.error?.message ??
    null;

  const errorMessage = clientError ?? serverError;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          Başlık <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ne yapman gerekiyor?"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Açıklama <span className="text-slate-400">(opsiyonel)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Detay eklemek istersen..."
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        // `isPending` → mutation uçuşta. Çift gönderimi engellemek için.
        disabled={createTodo.isPending}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {createTodo.isPending ? "Ekleniyor..." : "Todo Ekle"}
      </button>
    </form>
  );
}
