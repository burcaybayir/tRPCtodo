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

/** A message written by a user on a task. */
export type Comment = {
  author: User;
  content: Scalars['String']['output'];
  /** ISO-8601 string. GraphQL has no built-in Date scalar. */
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  task: Task;
};

export type Mutation = {
  addCommentToTask: Comment;
  /**
   * Moves a task into a team, or out of every team when teamId is null.
   *
   * NOT IN THE ORIGINAL SPEC for this feature, which listed only createTeam,
   * addUserToTeam and addCommentToTask. It was added because Team.tasks is
   * otherwise unreachable: nothing would ever set Task.teamId, so every team
   * would show an empty task list forever and the nested team query would have
   * nothing to nest. A schema needs a writer for every relation it exposes.
   */
  addTaskToTeam: Task;
  /** Moves a user into a team. A user belongs to at most one team. */
  addUserToTeam: User;
  /**
   * Links a task to a user, forming the one-to-one relation.
   *
   * Fails if the task is already assigned, or if the user already holds a task.
   * Returns the updated task so the client can read back the new state.
   */
  assignTaskToUser: Task;
  /** Creates an unassigned task. */
  createTask: Task;
  createTeam: Team;
  /** Creates a user with no task assigned. */
  createUser: User;
  /** Breaks the link, leaving both the task and the user free again. */
  unassignTask: Task;
};


export type MutationAddCommentToTaskArgs = {
  authorId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
  taskId: Scalars['ID']['input'];
};


export type MutationAddTaskToTeamArgs = {
  taskId: Scalars['ID']['input'];
  teamId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationAddUserToTeamArgs = {
  teamId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
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


export type MutationCreateTeamArgs = {
  name: Scalars['String']['input'];
};


export type MutationCreateUserArgs = {
  age: Scalars['Int']['input'];
  name: Scalars['String']['input'];
};


export type MutationUnassignTaskArgs = {
  taskId: Scalars['ID']['input'];
};

export type PageInfo = {
  /** Cursor of the last edge in this page, or null when the page is empty. */
  endCursor: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type Query = {
  /** A single task by id, or null if no such task exists. */
  task: Maybe<Task>;
  /** All tasks, ordered by name. */
  tasks: Array<Task>;
  /**
   * Cursor-paginated tasks.
   *
   * NOTE ON NAMING: the spec for this feature called for a field named tasks
   * taking (teamId, type, first, after), but Query.tasks already exists and
   * returns [Task!]!.
   * Changing its return type to TaskConnection would break the Task Assignment
   * tab that queries it today. GraphQL has a single flat Query namespace and no
   * field overloading, so a second name is the only non-breaking option — a
   * small, very real lesson in schema evolution.
   */
  tasksConnection: TaskConnection;
  /**
   * A team with everything hanging off it.
   *
   * This is the field that demonstrates GraphQL's answer to over-fetching and
   * under-fetching at once. Two callers in the UI hit this SAME field at
   * different depths:
   *
   *   TeamPicker    → team(id) { id name }
   *   TeamOverview  → team(id) { name users { name } tasks { name comments { content author { name } } } }
   *
   * In REST those would be two endpoints (or one endpoint that over-serves the
   * first caller). Here they are one field, and the server does exactly the
   * work each caller asked for — the shallow call never touches the comment
   * tables at all.
   */
  team: Maybe<Team>;
  /** All teams, ordered by name. */
  teams: Array<Team>;
  /** A single user by id, or null if no such user exists. */
  user: Maybe<User>;
  /** All users, ordered by name. */
  users: Array<User>;
};


export type QueryTaskArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTasksConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  teamId?: InputMaybe<Scalars['ID']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTeamArgs = {
  id: Scalars['ID']['input'];
};


export type QueryUserArgs = {
  id: Scalars['ID']['input'];
};

/**
 * Subscriptions are a THIRD root type, alongside Query and Mutation.
 *
 * Infrastructurally they are a different animal. A query or mutation is one
 * HTTP request and one response: the connection opens, data flows, the
 * connection closes. A subscription is a long-lived WebSocket that the SERVER
 * writes to whenever it has something to say — the client is not asking, it is
 * listening.
 *
 * That is why this project needs a custom Node server (see server.ts). A
 * Next.js route handler is invoked per request and returns a Response; it has
 * nowhere to keep a socket open between calls. Subscriptions need a process
 * that owns the connection, so the WebSocket lives outside the App Router even
 * though it serves the same schema.
 */
export type Subscription = {
  /** Fires whenever a comment is added to the given task. */
  commentAdded: Comment;
};


/**
 * Subscriptions are a THIRD root type, alongside Query and Mutation.
 *
 * Infrastructurally they are a different animal. A query or mutation is one
 * HTTP request and one response: the connection opens, data flows, the
 * connection closes. A subscription is a long-lived WebSocket that the SERVER
 * writes to whenever it has something to say — the client is not asking, it is
 * listening.
 *
 * That is why this project needs a custom Node server (see server.ts). A
 * Next.js route handler is invoked per request and returns a Response; it has
 * nowhere to keep a socket open between calls. Subscriptions need a process
 * that owns the connection, so the WebSocket lives outside the App Router even
 * though it serves the same schema.
 */
export type SubscriptionCommentAddedArgs = {
  taskId: Scalars['ID']['input'];
};

/** A unit of work that can be assigned to at most one user. */
export type Task = {
  /** Comments on this task, oldest first. Resolved through a DataLoader. */
  comments: Array<Comment>;
  /**
   * The same data as "comments", fetched WITHOUT batching.
   *
   * This field exists only to make the N+1 problem measurable — the UI never
   * uses it. Query   tasks { comments { id } }   and then
   * tasks { commentsNaive { id } }   and compare the query counts logged to the
   * server terminal. See the notes in team/resolvers.ts.
   */
  commentsNaive: Array<Comment>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  /** The team that owns this task, or null if it belongs to no team. */
  team: Maybe<Team>;
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

/**
 * One page of tasks, in the Relay connection style.
 *
 * Why the extra wrapping (edges → node) instead of just returning [Task!]!?
 * Because the CURSOR belongs to the edge, not to the task. A task's position in
 * a result set is a property of this particular traversal, not of the task
 * itself — so it lives on the edge that connects them.
 */
export type TaskConnection = {
  edges: Array<TaskEdge>;
  pageInfo: PageInfo;
  /** Total number of tasks matching the filter, ignoring pagination. */
  totalCount: Scalars['Int']['output'];
};

export type TaskEdge = {
  /** Opaque pointer to this row. Pass it back as the after argument to continue. */
  cursor: Scalars['String']['output'];
  node: Task;
};

/** A group that owns members and tasks. Both relations are one-to-many. */
export type Team = {
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  /** Tasks owned by this team. */
  tasks: Array<Task>;
  /** Members of this team. Empty list rather than null when there are none. */
  users: Array<User>;
};

/** A person who can be assigned exactly one task. */
export type User = {
  age: Scalars['Int']['output'];
  /** Comments written by this user. */
  comments: Array<Comment>;
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
  /** The team this user belongs to, or null. */
  team: Maybe<Team>;
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

export type GetTeamsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetTeamsQuery = { teams: Array<{ id: string, name: string }> };

export type GetTeamShallowQueryVariables = Exact<{
  id: string | number;
}>;


export type GetTeamShallowQuery = { team: { id: string, name: string } | null };

export type GetTeamDeepQueryVariables = Exact<{
  id: string | number;
}>;


export type GetTeamDeepQuery = { team: { id: string, name: string, users: Array<{ id: string, name: string, age: number }>, tasks: Array<{ id: string, name: string, type: string, comments: Array<{ id: string, content: string, createdAt: string, author: { id: string, name: string } }> }> } | null };

export type GetTasksConnectionQueryVariables = Exact<{
  teamId?: string | number | null | undefined;
  type?: string | null | undefined;
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;


export type GetTasksConnectionQuery = { tasksConnection: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, name: string, type: string, user: { id: string, name: string } | null, team: { id: string, name: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type GetTaskWithCommentsQueryVariables = Exact<{
  id: string | number;
}>;


export type GetTaskWithCommentsQuery = { task: { id: string, name: string, description: string, type: string, comments: Array<{ id: string, content: string, createdAt: string, author: { id: string, name: string } }> } | null };

export type CreateTeamMutationVariables = Exact<{
  name: string;
}>;


export type CreateTeamMutation = { createTeam: { id: string, name: string } };

export type AddUserToTeamMutationVariables = Exact<{
  userId: string | number;
  teamId: string | number;
}>;


export type AddUserToTeamMutation = { addUserToTeam: { id: string, name: string, team: { id: string, name: string } | null } };

export type AddTaskToTeamMutationVariables = Exact<{
  taskId: string | number;
  teamId?: string | number | null | undefined;
}>;


export type AddTaskToTeamMutation = { addTaskToTeam: { id: string, name: string, team: { id: string, name: string } | null } };

export type AddCommentToTaskMutationVariables = Exact<{
  taskId: string | number;
  authorId: string | number;
  content: string;
}>;


export type AddCommentToTaskMutation = { addCommentToTask: { id: string, content: string, createdAt: string, author: { id: string, name: string } } };

export type CommentAddedSubscriptionVariables = Exact<{
  taskId: string | number;
}>;


export type CommentAddedSubscription = { commentAdded: { id: string, content: string, createdAt: string, author: { id: string, name: string } } };
