/**
 * GRAPHQL OPERATIONS (the documents the UI sends)
 *
 * Every query and mutation the Task Assignment tab uses lives here, in one
 * place, so you can read the client's entire contract with the server at once.
 *
 * WHAT AN "OPERATION" IS, AND WHY tRPC HAS NO EQUIVALENT
 *
 * In tRPC you call a procedure and receive whatever the server decided to
 * return. In GraphQL you send a *document* that states exactly which fields you
 * want, and the response has precisely that shape — no more, no less.
 *
 * That is why `GetUsers` below asks for `task { id name type }` but not
 * `task { description }`: the assignment table does not display descriptions,
 * so we do not fetch them. The server's `Task.description` field still exists;
 * this particular caller simply declines it.
 *
 * NAMING MATTERS HERE. The operation names (`GetUsers`, `CreateUser`, ...) are
 * what GraphQL Code Generator turns into TypeScript type names
 * (`GetUsersQuery`, `CreateUserMutationVariables`, ...). Rename an operation
 * and the generated types are renamed with it.
 */

import { gql } from "@apollo/client";

/** Drives the users list and the "assign to" dropdown. */
export const GET_USERS = gql`
  query GetUsers {
    users {
      id
      name
      age
      # Asking for this nested field is what triggers the User.task field
      # resolver on the server — once per user. Delete these five lines and
      # that resolver stops running entirely; the server does strictly less
      # work because this caller stopped asking. Watch the Prisma query log
      # while you do it. (See the N+1 notes at the bottom of resolvers.ts for
      # what that extra work actually costs here.)
      task {
        id
        name
        type
      }
    }
  }
`;

/** Drives the tasks list, the task dropdown, and the assignments table. */
export const GET_TASKS = gql`
  query GetTasks {
    tasks {
      id
      name
      description
      type
      user {
        id
        name
      }
    }
  }
`;

export const CREATE_USER = gql`
  mutation CreateUser($name: String!, $age: Int!) {
    createUser(name: $name, age: $age) {
      id
      name
      age
      task {
        id
        name
        type
      }
    }
  }
`;

export const CREATE_TASK = gql`
  mutation CreateTask($name: String!, $description: String!, $type: String!) {
    createTask(name: $name, description: $description, type: $type) {
      id
      name
      description
      type
      user {
        id
        name
      }
    }
  }
`;

/**
 * Note what this mutation asks for in its response: `user { id name }`.
 *
 * That is not decoration. Because Apollo's cache is normalized, returning the
 * updated Task WITH its new user lets the cache patch `Task:<id>` in place —
 * every list already showing that task updates itself, with no refetch. Ask for
 * only `{ id }` here and the screen would go stale until something else
 * refetched it.
 *
 * Returning the mutated entity with the fields the UI displays is the single
 * most useful habit in GraphQL client work.
 */
export const ASSIGN_TASK_TO_USER = gql`
  mutation AssignTaskToUser($taskId: ID!, $userId: ID!) {
    assignTaskToUser(taskId: $taskId, userId: $userId) {
      id
      name
      description
      type
      user {
        id
        name
      }
    }
  }
`;

export const UNASSIGN_TASK = gql`
  mutation UnassignTask($taskId: ID!) {
    unassignTask(taskId: $taskId) {
      id
      name
      description
      type
      user {
        id
        name
      }
    }
  }
`;
