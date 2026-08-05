/**
 * ZOD SCHEMAS
 *
 * Why a separate file? So the same schema can run on the server (procedure
 * input validation) and on the client (form validation). One source means the
 * rules cannot drift apart in two places.
 *
 * The core idea: THE SCHEMA IS THE SINGLE SOURCE OF TRUTH. We never hand-write
 * the types — we derive them from the schema with `z.infer`.
 */

import { z } from "zod";

/** Input for the `create` mutation. */
export const createTodoSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Title must be at most 120 characters"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be at most 500 characters")
    .optional()
    // Turn an empty string into `undefined` so the database stores NULL
    // rather than "".
    .transform((v) => (v === "" ? undefined : v)),
});

/**
 * Input for the `list` query.
 *
 * `.optional()` is doing work at two levels here:
 *  1. omit `completed` → no filter, everything is returned
 *  2. omit the whole object (the outer `.optional()`) → `list()` can be called
 *     with no arguments at all
 */
export const listTodosSchema = z
  .object({
    completed: z.boolean().optional(),
  })
  .optional();

/** Input for the `toggle` and `delete` mutations. */
export const todoIdSchema = z.object({
  id: z.string().cuid("Invalid todo id"),
});

/**
 * TYPE INFERENCE (`z.infer`)
 *
 * We wrote the schema; the types come free. Change the schema and the types
 * change with it — there is no way for the two to fall out of sync.
 *
 * CreateTodoInput is equivalent to:
 *   { title: string; description?: string | undefined }
 *
 * One subtlety: because we use `.transform()`, the input and output types can
 * differ. `z.infer` is the OUTPUT type (after parsing), while `z.input` is the
 * INPUT type (before parsing — the raw shape coming off the form).
 */
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type CreateTodoRawInput = z.input<typeof createTodoSchema>;
export type ListTodosInput = z.infer<typeof listTodosSchema>;
export type TodoIdInput = z.infer<typeof todoIdSchema>;
