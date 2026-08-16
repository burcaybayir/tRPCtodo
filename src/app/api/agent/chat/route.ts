/**
 * AGENT ENDPOINT
 *
 * One route, two kinds of request:
 *
 *   { message }                      → a new user turn; runs the agent loop
 *   { decision, toolUseId }          → resolves a parked action; resumes it
 *
 * Both return the same shape, so the client has one response handler:
 *
 *   { status: "done",                 transcript }
 *   { status: "pending_confirmation", transcript, pending }
 *
 * WHY THE SERVER KEEPS THE CONVERSATION
 *
 * The browser sends a `conversationId` and nothing else about the history. The
 * Anthropic message array — with its tool_use ids, tool_result blocks, and
 * thinking blocks — never leaves the server.
 *
 * That is not just tidiness. If the client held the history, it could edit it
 * before sending it back: rewrite a tool result, forge an approval, delete the
 * declined action from the record. The human-in-the-loop gate would then be a
 * client-side suggestion rather than a server-side rule. The pending queue
 * lives on the server for the same reason — the only thing the browser can say
 * about a proposed action is "confirm" or "cancel", by id.
 *
 * This route is NOT a GraphQL mutation or a tRPC procedure, deliberately: it
 * is an orchestration endpoint whose job is to run a loop of external API
 * calls, not to read or write one entity. Modelling that as a query language
 * field would be shoehorning.
 */

import type { NextRequest } from "next/server";
import { resolvePending, sendMessage } from "~/server/agent/loop";

/**
 * The loop makes several sequential model calls, each of which can take a
 * while. Next's default is fine in dev, but the ceiling is raised explicitly
 * so a multi-step run is not cut off on platforms with a shorter default.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const { conversationId, message, decision, toolUseId } = (body ?? {}) as {
    conversationId?: string;
    message?: string;
    decision?: "confirm" | "cancel";
    toolUseId?: string;
  };

  try {
    // Branch 1: resolving a proposed action.
    if (decision) {
      if (!conversationId || !toolUseId) {
        return Response.json(
          { error: "A decision needs conversationId and toolUseId" },
          { status: 400 },
        );
      }

      const result = await resolvePending(
        conversationId,
        toolUseId,
        decision === "confirm",
      );
      return Response.json(result);
    }

    // Branch 2: a new user message.
    if (typeof message !== "string" || message.trim() === "") {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const result = await sendMessage(conversationId, message.trim());
    return Response.json(result);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "The agent request failed";

    console.error("[agent] request failed:", detail);

    // 400 rather than 500: every error this loop raises is about the state of
    // the request (missing key, stale conversation, nothing pending), not a
    // crash — and the message is written to be shown to the user.
    return Response.json({ error: detail }, { status: 400 });
  }
}
