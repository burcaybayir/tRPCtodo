/**
 * TEAM & ACTIVITY OPERATIONS
 *
 * The two `team(id)` documents at the top of this file are the point of the
 * whole feature. They hit the SAME server field at two different depths, and
 * the server does correspondingly different amounts of work. Read them next to
 * each other before anything else here.
 */

import { gql } from "@apollo/client";

/** Team list for the picker. Two scalar fields — nothing else is fetched. */
export const GET_TEAMS = gql`
  query GetTeams {
    teams {
      id
      name
    }
  }
`;

/**
 * DEPTH 1 — the shallow read.
 *
 * The header only needs a name. Asking for `team(id) { id name }` runs exactly
 * one SELECT against the Team table: the `users` and `tasks` resolvers never
 * fire, and the comment tables are never touched.
 */
export const GET_TEAM_SHALLOW = gql`
  query GetTeamShallow($id: ID!) {
    team(id: $id) {
      id
      name
    }
  }
`;

/**
 * DEPTH 2 — the deep read, same field.
 *
 * The overview panel wants the whole activity tree in one round trip: members,
 * tasks, and every task's comments with their authors. Four levels deep,
 * one request.
 *
 * This is GraphQL's answer to the two classic REST failure modes at once:
 *
 *   under-fetching → REST would need GET /teams/1, then /teams/1/users, then
 *                    /teams/1/tasks, then /tasks/:id/comments per task. A
 *                    waterfall whose length depends on the data.
 *   over-fetching  → a REST endpoint fat enough to serve this panel would also
 *                    be what the header above calls, shipping comment threads
 *                    to a component that renders a single string.
 *
 * One field, two callers, two different amounts of work. No endpoint had to be
 * designed for either of them.
 *
 * The cost is visible in the server terminal: this query triggers the
 * DataLoader batch line, the shallow one does not.
 */
export const GET_TEAM_DEEP = gql`
  query GetTeamDeep($id: ID!) {
    team(id: $id) {
      id
      name
      users {
        id
        name
        age
      }
      tasks {
        id
        name
        type
        comments {
          id
          content
          createdAt
          author {
            id
            name
          }
        }
      }
    }
  }
`;

/**
 * Cursor-paginated task list.
 *
 * `after` is null on the first page and carries the previous page's `endCursor`
 * afterwards. Note that the query asks for `cursor` on every edge even though
 * the UI only uses the last one — cursors are per-edge by design, so any row
 * can become the anchor for the next page.
 */
export const GET_TASKS_CONNECTION = gql`
  query GetTasksConnection($teamId: ID, $type: String, $first: Int, $after: String) {
    tasksConnection(teamId: $teamId, type: $type, first: $first, after: $after) {
      totalCount
      edges {
        cursor
        node {
          id
          name
          type
          user {
            id
            name
          }
          team {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Task detail with its comment thread. */
export const GET_TASK_WITH_COMMENTS = gql`
  query GetTaskWithComments($id: ID!) {
    task(id: $id) {
      id
      name
      description
      type
      comments {
        id
        content
        createdAt
        author {
          id
          name
        }
      }
    }
  }
`;

export const CREATE_TEAM = gql`
  mutation CreateTeam($name: String!) {
    createTeam(name: $name) {
      id
      name
    }
  }
`;

/**
 * Returns the user WITH their new team so Apollo can patch `User:<id>` in the
 * normalized cache. Everything already on screen showing that user updates
 * without a refetch.
 */
export const ADD_USER_TO_TEAM = gql`
  mutation AddUserToTeam($userId: ID!, $teamId: ID!) {
    addUserToTeam(userId: $userId, teamId: $teamId) {
      id
      name
      team {
        id
        name
      }
    }
  }
`;

export const ADD_TASK_TO_TEAM = gql`
  mutation AddTaskToTeam($taskId: ID!, $teamId: ID) {
    addTaskToTeam(taskId: $taskId, teamId: $teamId) {
      id
      name
      team {
        id
        name
      }
    }
  }
`;

export const ADD_COMMENT_TO_TASK = gql`
  mutation AddCommentToTask($taskId: ID!, $authorId: ID!, $content: String!) {
    addCommentToTask(taskId: $taskId, authorId: $authorId, content: $content) {
      id
      content
      createdAt
      author {
        id
        name
      }
    }
  }
`;

/**
 * THE SUBSCRIPTION.
 *
 * Syntactically it is just another operation — same document, same variables,
 * same selection set. Everything different about it is underneath:
 *
 *   query/mutation → HTTP POST to /api/graphql. One request, one response, the
 *                    connection closes. The client always speaks first.
 *   subscription   → WebSocket to /api/graphql/ws. The connection stays open
 *                    and the SERVER speaks whenever it has something. The
 *                    client's only message is "I am listening".
 *
 * The routing between the two is done by the split link in client.ts, based on
 * the operation type in the document. Nothing in this file says which
 * transport to use — that stays a client concern, exactly as it should be.
 */
export const COMMENT_ADDED_SUBSCRIPTION = gql`
  subscription CommentAdded($taskId: ID!) {
    commentAdded(taskId: $taskId) {
      id
      content
      createdAt
      author {
        id
        name
      }
    }
  }
`;
