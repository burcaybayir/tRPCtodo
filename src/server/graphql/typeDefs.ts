/**
 * GRAPHQL SCHEMA (SDL — Schema Definition Language)
 *
 * This is the single biggest structural difference from tRPC.
 *
 *   tRPC  → CODE-FIRST. There is no schema artifact. The API's shape IS the
 *           TypeScript code in `routers/todo.ts`, and the client learns it by
 *           importing `typeof appRouter`. Nothing to publish, nothing to sync,
 *           but also: only a TypeScript client can consume it.
 *
 *   GraphQL (here) → SCHEMA-FIRST. The contract lives in this SDL document,
 *           written in a language-neutral syntax. The server must implement it
 *           (see resolvers.ts) and the client queries against it. Any client in
 *           any language can read this schema and know exactly what exists.
 *
 * The trade-off in one line: tRPC gives you types for free but only for
 * TypeScript; GraphQL gives you a portable, introspectable contract but you pay
 * for it with a schema to maintain and a codegen step to get types back.
 *
 * Note the `"""triple-quoted"""` strings below — those are GraphQL *docstrings*,
 * not comments. They are part of the schema and show up in GraphQL clients and
 * introspection tools. Regular `#` comments are stripped and stay server-side.
 */

import gql from "graphql-tag";

export const typeDefs = gql`
  """
  A person who can be assigned exactly one task.
  """
  type User {
    id: ID!
    name: String!
    age: Int!

    """
    The task assigned to this user, or null if none.

    Nullable on purpose: a user without a task is a perfectly valid state, not
    an error. In GraphQL, "!" means "this can never be null" — using it here
    would force us to invent a fake task for unassigned users.

    This field is NOT a database column. It is produced by a field resolver
    (see the "User" resolver map in resolvers.ts) that runs an extra query.
    """
    task: Task
  }

  """
  A unit of work that can be assigned to at most one user.
  """
  type Task {
    id: ID!
    name: String!
    description: String!

    """
    Free-form category, e.g. "bug", "feature", "chore".

    Kept as String for simplicity. In a real schema this is exactly where you
    would reach for an enum:  type: TaskType!  with  enum TaskType { BUG ... }
    which makes invalid values unrepresentable rather than merely discouraged.
    """
    type: String!

    """
    The user this task is assigned to, or null if unassigned.
    Also resolved by a field resolver, not read from the parent row directly.
    """
    user: User
  }

  type Query {
    "All users, ordered by name."
    users: [User!]!

    "All tasks, ordered by name."
    tasks: [Task!]!

    "A single user by id, or null if no such user exists."
    user(id: ID!): User

    "A single task by id, or null if no such task exists."
    task(id: ID!): Task
  }

  type Mutation {
    "Creates a user with no task assigned."
    createUser(name: String!, age: Int!): User!

    "Creates an unassigned task."
    createTask(name: String!, description: String!, type: String!): Task!

    """
    Links a task to a user, forming the one-to-one relation.

    Fails if the task is already assigned, or if the user already holds a task.
    Returns the updated task so the client can read back the new state.
    """
    assignTaskToUser(taskId: ID!, userId: ID!): Task!

    "Breaks the link, leaving both the task and the user free again."
    unassignTask(taskId: ID!): Task!
  }
`;

/**
 * A note on shape: GraphQL has exactly two root types for reading and writing —
 * `Query` and `Mutation`. tRPC expresses the same distinction per-procedure
 * (`.query()` vs `.mutation()`) and lets you nest routers freely
 * (`trpc.todo.list`). GraphQL has no namespaces; every field on `Query` lives
 * in one flat global list, which is why real schemas end up with names like
 * `taskAssignmentUsers` once they grow.
 */
