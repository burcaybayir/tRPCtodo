/**
 * ZOD ŞEMALARI
 *
 * Neden ayrı dosya? Aynı şemayı hem sunucuda (procedure input doğrulaması)
 * hem de istemcide (form doğrulaması) kullanabilelim diye. Tek kaynak =
 * kurallar iki yerde ayrışmaz.
 *
 * Buradaki asıl fikir: ŞEMA TEK GERÇEK KAYNAKTIR, tipleri elle yazmayız —
 * `z.infer` ile şemadan çıkarırız.
 */

import { z } from "zod";

/** `create` mutation'ının input'u */
export const createTodoSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Başlık zorunludur")
    .max(120, "Başlık en fazla 120 karakter olabilir"),
  description: z
    .string()
    .trim()
    .max(500, "Açıklama en fazla 500 karakter olabilir")
    .optional()
    // Boş string gelirse `undefined`'a çevir: DB'de "" yerine NULL dursun.
    .transform((v) => (v === "" ? undefined : v)),
});

/**
 * `list` query'sinin input'u.
 *
 * `.optional()` iki katmanda birden iş yapıyor:
 *  1. `completed` verilmezse → filtre yok, hepsi döner
 *  2. Tüm nesne verilmezse (`.optional()` en dışta) → `list()` argümansız çağrılabilir
 */
export const listTodosSchema = z
  .object({
    completed: z.boolean().optional(),
  })
  .optional();

/** `toggle` ve `delete` mutation'larının input'u */
export const todoIdSchema = z.object({
  id: z.string().cuid("Geçersiz todo id"),
});

/**
 * TİP ÇIKARIMI (`z.infer`)
 *
 * Şemayı yazdık, tipi bedavaya alıyoruz. Şemayı değiştirdiğinde tip de
 * otomatik değişir — ikisinin birbirinden kopma ihtimali yok.
 *
 * CreateTodoInput şuna eşit:
 *   { title: string; description?: string | undefined }
 *
 * Küçük bir ayrıntı: `.transform()` kullandığımız için giriş ve çıkış tipleri
 * farklılaşabilir. `z.infer` = ÇIKIŞ tipi (parse sonrası),
 * `z.input` = GİRİŞ tipi (parse öncesi, formdan gelen ham hali).
 */
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type CreateTodoRawInput = z.input<typeof createTodoSchema>;
export type ListTodosInput = z.infer<typeof listTodosSchema>;
export type TodoIdInput = z.infer<typeof todoIdSchema>;
