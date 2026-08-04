/**
 * GRAPHQL CODE GENERATOR
 *
 * This config exists to answer one question: where do the TypeScript types for
 * the GraphQL side come from?
 *
 * On the tRPC side, nowhere — they already exist. `AppRouter` is a TypeScript
 * type, so `trpc.todo.list.useQuery()` is typed the instant you save the
 * router. There is no generation step because there is nothing to generate.
 *
 * GraphQL's schema is not TypeScript, so the types have to be produced. Codegen
 * reads the SDL and the operation documents, then writes a `.ts` file
 * containing a type for every schema type and for every query/mutation's
 * result and variables.
 *
 * Run it with:   npm run codegen
 * Watch mode:    npm run codegen -- --watch
 *
 * The generated file is COMMITTED to git on purpose, so the app type-checks on
 * a fresh clone without anyone remembering to run codegen first. The cost is
 * that you must re-run it after changing the schema or any operation — and
 * that cost, paid on every schema change forever, is the honest price of
 * GraphQL's language-neutral contract.
 */

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  /**
   * Where the schema lives. Codegen reads the `gql` template out of this TS
   * file directly — no running server required, so this works offline and in
   * CI. (The alternative, pointing at http://localhost:3000/api/graphql and
   * introspecting a live server, is also supported and is what you would use
   * against an API you do not own.)
   */
  schema: "src/server/graphql/typeDefs.ts",

  /** Where the client's queries and mutations live. */
  documents: ["src/lib/apollo/operations.ts"],

  generates: {
    "src/lib/apollo/generated/graphql.ts": {
      plugins: [
        // Types for the schema itself: User, Task, Query, Mutation...
        "typescript",
        // Types per operation: GetUsersQuery, CreateUserMutationVariables...
        "typescript-operations",
      ],
      config: {
        // The SDL says `task: Task` (nullable) — emit `Task | null` rather than
        // the looser `Maybe<Task>` alias, so nullability reads plainly at the
        // call site.
        avoidOptionals: { field: true },
        // Skip the `__typename` field in generated result types; Apollo adds it
        // at runtime but the UI never reads it here.
        skipTypename: true,
      },
    },
  },

  // Keep generated output consistent with the rest of the codebase.
  hooks: { afterAllFileWrite: [] },
};

export default config;
