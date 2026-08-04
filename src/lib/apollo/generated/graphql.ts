/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type Mutation = {
  /**
   * Links a task to a user, forming the one-to-one relation.
   *
   * Fails if the task is already assigned, or if the user already holds a task.
   * Returns the updated task so the client can read back the new state.
   */
  assignTaskToUser: Task;
  /** Creates an unassigned task. */
  createTask: Task;
  /** Creates a user with no task assigned. */
  createUser: User;
  /** Breaks the link, leaving both the task and the user free again. */
  unassignTask: Task;
};


export type MutationAssignTaskToUserArgs = {
  taskId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationCreateTaskArgs = {
  description: Scalars['String']['input'];
  name: Scalars['String']['input'];
  type: Scalars['String']['input'];
};


export type MutationCreateUserArgs = {
  age: Scalars['Int']['input'];
  name: Scalars['String']['input'];
};


export type MutationUnassignTaskArgs = {
  taskId: Scalars['ID']['input'];
};

export type Query = {
  /** A single task by id, or null if no such task exists. */
  task: Maybe<Task>;
  /** All tasks, ordered by name. */
  tasks: Array<Task>;
  /** A single user by id, or null if no such user exists. */
  user: Maybe<User>;
  /** All users, ordered by name. */
  users: Array<User>;
};


export type QueryTaskArgs = {
  id: Scalars['ID']['input'];
};


export type QueryUserArgs = {
  id: Scalars['ID']['input'];
};

/** A unit of work that can be assigned to at most one user. */
export type Task = {
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  /**
   * Free-form category, e.g. "bug", "feature", "chore".
   *
   * Kept as String for simplicity. In a real schema this is exactly where you
   * would reach for an enum:  type: TaskType!  with  enum TaskType { BUG ... }
   * which makes invalid values unrepresentable rather than merely discouraged.
   */
  type: Scalars['String']['output'];
  /**
   * The user this task is assigned to, or null if unassigned.
   * Also resolved by a field resolver, not read from the parent row directly.
   */
  user: Maybe<User>;
};

/** A person who can be assigned exactly one task. */
export type User = {
  age: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  /**
   * The task assigned to this user, or null if none.
   *
   * Nullable on purpose: a user without a task is a perfectly valid state, not
   * an error. In GraphQL, "!" means "this can never be null" — using it here
   * would force us to invent a fake task for unassigned users.
   *
   * This field is NOT a database column. It is produced by a field resolver
   * (see the "User" resolver map in resolvers.ts) that runs an extra query.
   */
  task: Maybe<Task>;
};

export type GetUsersQueryVariables = Exact<{ [key: string]: never; }>;


export type GetUsersQuery = { users: Array<{ id: string, name: string, age: number, task: { id: string, name: string, type: string } | null }> };

export type GetTasksQueryVariables = Exact<{ [key: string]: never; }>;


export type GetTasksQuery = { tasks: Array<{ id: string, name: string, description: string, type: string, user: { id: string, name: string } | null }> };

export type CreateUserMutationVariables = Exact<{
  name: string;
  age: number;
}>;


export type CreateUserMutation = { createUser: { id: string, name: string, age: number, task: { id: string, name: string, type: string } | null } };

export type CreateTaskMutationVariables = Exact<{
  name: string;
  description: string;
  type: string;
}>;


export type CreateTaskMutation = { createTask: { id: string, name: string, description: string, type: string, user: { id: string, name: string } | null } };

export type AssignTaskToUserMutationVariables = Exact<{
  taskId: string | number;
  userId: string | number;
}>;


export type AssignTaskToUserMutation = { assignTaskToUser: { id: string, name: string, description: string, type: string, user: { id: string, name: string } | null } };

export type UnassignTaskMutationVariables = Exact<{
  taskId: string | number;
}>;


export type UnassignTaskMutation = { unassignTask: { id: string, name: string, description: string, type: string, user: { id: string, name: string } | null } };
