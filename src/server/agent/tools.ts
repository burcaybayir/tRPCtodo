/**
 * AGENT TOOLS — thin adapters over the app's existing mutations
 *
 * Every tool here is a wrapper, not an implementation. The business rules —
 * "a task can only be assigned to a user who has no task", "a comment cannot be
 * empty", "attaching a voice message replaces the old one" — all live in the
 * GraphQL resolvers already, and the agent gets them for free by calling those
 * resolvers. Duplicating any of that logic here would mean two places to keep
 * correct, and the agent's copy would be the one that silently drifted.
 *
 * WHY WE CALL RESOLVER FUNCTIONS DIRECTLY, NOT OVER HTTP
 *
 * The obvious implementation is for the agent to POST to /api/graphql like any
 * other client. It would work, and it would be wasteful: the request would
 * leave the process, get parsed, get validated, and come back — all to reach a
 * function that is one import away. A GraphQL resolver is a plain function
 *
 *     (parent, args, context, info) => result
 *
 * so we import the resolver map and call it. Same code path, same validation,
 * same errors, no network hop.
 *
 * What we give up by skipping the HTTP layer: GraphQL's own argument
 * validation (the SDL's `String!` checks) and query-level authorization. The
 * first is replaced by the JSON Schema on each tool below — the model's input
 * is checked against it before we ever get here. The second does not exist in
 * this app. In a system with real auth, this is exactly where you would put
 * the check, because the agent must never be a way around a permission the
 * user does not have.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { resolvers } from "~/server/graphql/resolvers";
import { teamResolvers } from "~/server/graphql/team/resolvers";
import { voiceResolvers } from "~/server/graphql/voice/resolvers";
import {
  createGraphQLContext,
  type GraphQLContext,
} from "~/server/graphql/context";

/**
 * A tool the agent can call.
 *
 * `mutates` is the field that drives the human-in-the-loop gate in loop.ts:
 * false → run it immediately, true → stop and ask the user first.
 */
type AgentTool = {
  definition: Anthropic.Beta.BetaTool;
  mutates: boolean;
  /** One-line description of a proposed call, rendered on the confirm card. */
  describe: (input: Record<string, unknown>) => string;
  run: (
    input: Record<string, unknown>,
    ctx: GraphQLContext,
  ) => Promise<unknown>;
};

/**
 * Tool descriptions are prompt engineering, not documentation.
 *
 * The model reads these to decide WHEN to call a tool, so each one says what
 * the tool does AND when to reach for it — a description that only states the
 * what leaves the model guessing about the when. The `listX` tools in
 * particular tell the model to resolve names to ids here rather than
 * inventing an id, which is the single most common failure mode for an agent
 * whose tools take opaque identifiers.
 */
export const AGENT_TOOLS: Record<string, AgentTool> = {
  listUsers: {
    mutates: false,
    definition: {
      name: "listUsers",
      description:
        "List users, optionally filtered to one team. Call this FIRST whenever the request mentions a person by name — you need their id for assignTaskToUser and addCommentToTask, and you must never guess an id. Returns id, name, age, teamId, and whether the user already has a task assigned.",
      input_schema: {
        type: "object",
        properties: {
          teamId: {
            type: "string",
            description: "Optional team id to filter by. Omit for all users.",
          },
        },
      },
    },
    describe: () => "List users",
    run: async (input, ctx) => {
      const users = await resolvers.Query.users(null, null, ctx);
      const teamId = input.teamId as string | undefined;

      const filtered = teamId
        ? users.filter((user) => user.teamId === teamId)
        : users;

      // Include `hasTask` so the model can tell, without a second call, that
      // assignTaskToUser would fail on this user.
      return Promise.all(
        filtered.map(async (user) => ({
          id: user.id,
          name: user.name,
          age: user.age,
          teamId: user.teamId,
          hasTask:
            (await ctx.db.task.findUnique({ where: { userId: user.id } })) !==
            null,
        })),
      );
    },
  },

  listTasks: {
    mutates: false,
    definition: {
      name: "listTasks",
      description:
        "List tasks, optionally filtered by team and/or type. Call this to find a task's id before commenting on it or assigning it, and to check what already exists before creating something that may be a duplicate. Returns id, name, description, type, and current assignee.",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "Optional team id filter." },
          type: {
            type: "string",
            description: 'Optional type filter, e.g. "bug" or "feature".',
          },
        },
      },
    },
    describe: () => "List tasks",
    run: async (input, ctx) => {
      // Reuses the paginated resolver rather than a bare findMany, so the
      // agent sees the same ordering and filtering the UI does.
      const connection = await teamResolvers.Query.tasksConnection(
        null,
        {
          teamId: (input.teamId as string) ?? null,
          type: (input.type as string) ?? null,
          first: 50,
          after: null,
        },
        ctx,
      );

      return connection.edges.map(({ node }) => ({
        id: node.id,
        name: node.name,
        description: node.description,
        type: node.type,
        teamId: node.teamId,
        assignedUserId: node.userId,
      }));
    },
  },

  createTask: {
    mutates: true,
    definition: {
      name: "createTask",
      description:
        "Create a new, unassigned task. Use assignTaskToUser afterwards if it should belong to someone.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short title for the task." },
          description: {
            type: "string",
            description: "What needs to happen. May be empty.",
          },
          type: {
            type: "string",
            description:
              'Category, e.g. "bug", "feature", "chore" or "research".',
          },
        },
        required: ["name", "description", "type"],
      },
    },
    describe: (input) => `Create task "${input.name}" (${input.type})`,
    run: (input, ctx) =>
      resolvers.Mutation.createTask(
        null,
        {
          name: input.name as string,
          description: input.description as string,
          type: input.type as string,
        },
        ctx,
      ),
  },

  assignTaskToUser: {
    mutates: true,
    definition: {
      name: "assignTaskToUser",
      description:
        "Assign an existing task to an existing user. This is a one-to-one relation: it fails if the task is already assigned, or if the user already holds another task. Resolve both ids with listTasks and listUsers first.",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          userId: { type: "string" },
        },
        required: ["taskId", "userId"],
      },
    },
    describe: (input) => `Assign task ${input.taskId} to user ${input.userId}`,
    run: (input, ctx) =>
      resolvers.Mutation.assignTaskToUser(
        null,
        { taskId: input.taskId as string, userId: input.userId as string },
        ctx,
      ),
  },

  addCommentToTask: {
    mutates: true,
    definition: {
      name: "addCommentToTask",
      description:
        "Post a comment on a task, attributed to a user. Both ids must exist — resolve them with listTasks and listUsers first.",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          authorId: {
            type: "string",
            description: "The user id the comment is written by.",
          },
          content: { type: "string", description: "The comment text." },
        },
        required: ["taskId", "authorId", "content"],
      },
    },
    describe: (input) =>
      `Comment on task ${input.taskId}: "${String(input.content).slice(0, 60)}"`,
    run: (input, ctx) =>
      teamResolvers.Mutation.addCommentToTask(
        null,
        {
          taskId: input.taskId as string,
          authorId: input.authorId as string,
          content: input.content as string,
        },
        ctx,
      ),
  },

  attachVoiceMessage: {
    mutates: true,
    definition: {
      name: "attachVoiceMessage",
      description:
        "Attach an already-uploaded audio file to a task by its URL, replacing any existing voice message. You cannot record or upload audio yourself — only call this when the user gives you a URL of a file that already exists.",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          url: {
            type: "string",
            description: "URL of the uploaded audio file, e.g. /uploads/x.webm",
          },
          duration: {
            type: "integer",
            description: "Length in seconds, if known.",
          },
        },
        required: ["taskId", "url"],
      },
    },
    describe: (input) =>
      `Attach voice message ${input.url} to task ${input.taskId}`,
    run: (input, ctx) =>
      voiceResolvers.Mutation.attachVoiceMessage(
        null,
        {
          taskId: input.taskId as string,
          url: input.url as string,
          duration: (input.duration as number) ?? null,
        },
        ctx,
      ),
  },
};

/** The tool list sent to the model on every request. */
export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = Object.values(
  AGENT_TOOLS,
).map((tool) => tool.definition);

/**
 * Executes one tool call and returns a JSON string for the tool_result block.
 *
 * A failed tool must still produce a result — the API requires one result per
 * tool_use block, and an error is far more useful to the model than silence:
 * told "This user already has a task assigned", it can pick a different user
 * and carry on. Swallowing the error would leave it guessing why nothing
 * happened.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<{ output: string; isError: boolean }> {
  const tool = AGENT_TOOLS[name];

  if (!tool) {
    return { output: `Unknown tool: ${name}`, isError: true };
  }

  // A fresh context per tool call: same per-request isolation the GraphQL
  // layer gets, including a clean DataLoader cache.
  const ctx = createGraphQLContext();

  try {
    const result = await tool.run(input, ctx);
    return { output: JSON.stringify(result), isError: false };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tool execution failed";
    console.error(`[agent] tool ${name} failed:`, message);
    return { output: message, isError: true };
  }
}
