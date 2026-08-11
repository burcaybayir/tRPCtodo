/**
 * TEAM & ACTIVITY SCHEMA
 *
 * A second SDL document, kept separate from `typeDefs.ts` on purpose.
 *
 * GraphQL schemas are MERGED, not nested: at startup every document is stitched
 * into one type system, and clients see a single flat schema. That is why
 * `extend type Task { ... }` below works — this file reaches into a type
 * declared in another file and adds fields to it, without either file needing
 * to know the other exists.
 *
 * The practical payoff is that the Task Assignment feature's SDL stays
 * untouched while Task grows two new fields.
 */

import gql from "graphql-tag";

export const teamTypeDefs = gql`
  """
  A group that owns members and tasks. Both relations are one-to-many.
  """
  type Team {
    id: ID!
    name: String!

    "Members of this team. Empty list rather than null when there are none."
    users: [User!]!

    "Tasks owned by this team."
    tasks: [Task!]!
  }

  """
  A message written by a user on a task.
  """
  type Comment {
    id: ID!
    content: String!

    "ISO-8601 string. GraphQL has no built-in Date scalar."
    createdAt: String!

    author: User!
    task: Task!
  }

  # Fields added to the Task type declared in typeDefs.ts.
  #
  # Adding fields here rather than editing the original type is how large
  # schemas stay modular — one team extends another team's types without
  # touching their files.
  #
  # Note these are "#" comments, not a """description""". A type EXTENSION
  # cannot carry a description: the description belongs to the type, and the
  # type was already described where it was declared. GraphQL rejects the
  # schema outright if you try, which is a nice example of the SDL being a real
  # language with real rules rather than a formatted string.
  extend type Task {
    "Comments on this task, oldest first. Resolved through a DataLoader."
    comments: [Comment!]!

    """
    The same data as "comments", fetched WITHOUT batching.

    This field exists only to make the N+1 problem measurable — the UI never
    uses it. Query   tasks { comments { id } }   and then
    tasks { commentsNaive { id } }   and compare the query counts logged to the
    server terminal. See the notes in team/resolvers.ts.
    """
    commentsNaive: [Comment!]!

    "The team that owns this task, or null if it belongs to no team."
    team: Team
  }

  # Fields added to the User type declared in typeDefs.ts.
  extend type User {
    "The team this user belongs to, or null."
    team: Team

    "Comments written by this user."
    comments: [Comment!]!
  }

  """
  One page of tasks, in the Relay connection style.

  Why the extra wrapping (edges → node) instead of just returning [Task!]!?
  Because the CURSOR belongs to the edge, not to the task. A task's position in
  a result set is a property of this particular traversal, not of the task
  itself — so it lives on the edge that connects them.
  """
  type TaskConnection {
    edges: [TaskEdge!]!
    pageInfo: PageInfo!

    "Total number of tasks matching the filter, ignoring pagination."
    totalCount: Int!
  }

  type TaskEdge {
    "Opaque pointer to this row. Pass it back as the after argument to continue."
    cursor: String!
    node: Task!
  }

  type PageInfo {
    hasNextPage: Boolean!

    "Cursor of the last edge in this page, or null when the page is empty."
    endCursor: String
  }

  extend type Query {
    """
    A team with everything hanging off it.

    This is the field that demonstrates GraphQL's answer to over-fetching and
    under-fetching at once. Two callers in the UI hit this SAME field at
    different depths:

      TeamPicker    → team(id) { id name }
      TeamOverview  → team(id) { name users { name } tasks { name comments { content author { name } } } }

    In REST those would be two endpoints (or one endpoint that over-serves the
    first caller). Here they are one field, and the server does exactly the
    work each caller asked for — the shallow call never touches the comment
    tables at all.
    """
    team(id: ID!): Team

    "All teams, ordered by name."
    teams: [Team!]!

    """
    Cursor-paginated tasks.

    NOTE ON NAMING: the spec for this feature called for a field named tasks
    taking (teamId, type, first, after), but Query.tasks already exists and
    returns [Task!]!.
    Changing its return type to TaskConnection would break the Task Assignment
    tab that queries it today. GraphQL has a single flat Query namespace and no
    field overloading, so a second name is the only non-breaking option — a
    small, very real lesson in schema evolution.
    """
    tasksConnection(
      "Filter to one team. Omit for tasks from every team."
      teamId: ID

      "Filter by task type, for example bug. Omit for all types."
      type: String

      "Page size. Defaults to 5 to make the Load more button easy to exercise."
      first: Int = 5

      "Cursor from a previous page's endCursor. Omit for the first page."
      after: String
    ): TaskConnection!
  }

  extend type Mutation {
    createTeam(name: String!): Team!

    "Moves a user into a team. A user belongs to at most one team."
    addUserToTeam(userId: ID!, teamId: ID!): User!

    """
    Moves a task into a team, or out of every team when teamId is null.

    NOT IN THE ORIGINAL SPEC for this feature, which listed only createTeam,
    addUserToTeam and addCommentToTask. It was added because Team.tasks is
    otherwise unreachable: nothing would ever set Task.teamId, so every team
    would show an empty task list forever and the nested team query would have
    nothing to nest. A schema needs a writer for every relation it exposes.
    """
    addTaskToTeam(taskId: ID!, teamId: ID): Task!

    addCommentToTask(taskId: ID!, authorId: ID!, content: String!): Comment!
  }

  """
  Subscriptions are a THIRD root type, alongside Query and Mutation.

  Infrastructurally they are a different animal. A query or mutation is one
  HTTP request and one response: the connection opens, data flows, the
  connection closes. A subscription is a long-lived WebSocket that the SERVER
  writes to whenever it has something to say — the client is not asking, it is
  listening.

  That is why this project needs a custom Node server (see server.ts). A
  Next.js route handler is invoked per request and returns a Response; it has
  nowhere to keep a socket open between calls. Subscriptions need a process
  that owns the connection, so the WebSocket lives outside the App Router even
  though it serves the same schema.
  """
  type Subscription {
    "Fires whenever a comment is added to the given task."
    commentAdded(taskId: ID!): Comment!
  }
`;
