/**
 * THE AGENT LOOP
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT MAKES THIS "AGENTIC" RATHER THAN JUST "AI"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A single-shot LLM call is one request and one answer:
 *
 *     "Summarize this task description" → model → text. Done.
 *
 * That is AI. The model produces output; your code decides what to do with it.
 * The number of model calls is fixed at one, and you knew that before you
 * started.
 *
 * This file is different in three ways, and all three are what the word
 * "agentic" points at:
 *
 *   1. MULTI-STEP. One user message can produce many model calls. "Create a
 *      bug-fix task for Ayşe and comment that it blocks the release" needs a
 *      user lookup, a task creation, an assignment, and a comment — four tool
 *      calls across at least five round trips to the model.
 *
 *   2. THE MODEL CHOOSES THE ACTIONS. Nothing in this file says "first call
 *      listUsers, then createTask". We hand over a set of tools and a goal;
 *      the model decides which to call and in what order. Give it a different
 *      sentence and it produces a different plan, with no code change.
 *
 *   3. IT REACTS TO RESULTS. Tool output goes back into the conversation, so
 *      the next decision is informed by the last one. `assignTaskToUser` fails
 *      with "this user already has a task" — the model reads that and adapts,
 *      rather than the whole run collapsing.
 *
 * The loop below is the entire mechanism. It is genuinely this small:
 *
 *     user message
 *          ↓
 *     ┌──► call the model with the conversation + tool definitions
 *     │         ↓
 *     │    stop_reason == "tool_use"?
 *     │         ├── no  → final text answer, exit the loop
 *     │         └── yes → execute each requested tool
 *     │                        ↓
 *     └──────────── append the results as a user message
 *
 * The loop's exit condition is `stop_reason`, not a step counter: it runs
 * until the model stops asking for tools. That is what "the model decides its
 * own sequence of actions" means concretely — the code cannot know in advance
 * how many times this will go around.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY HUMAN-IN-THE-LOOP CONFIRMATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The three properties above are exactly what makes an agent useful, and
 * exactly what makes an unsupervised one dangerous. The model picks the
 * actions, so nobody reviewed them; it runs many steps, so a wrong turn early
 * compounds; and it writes to a database, so the mistakes persist.
 *
 * Natural language is also ambiguous in ways an API call is not. "Clean up the
 * old bug tasks" has a reading that comments on them and a reading that
 * deletes them. A fully autonomous agent picks one and you find out afterwards.
 *
 * So this loop splits its tools in two:
 *
 *   READ-ONLY tools (listUsers, listTasks) run immediately, with no prompt.
 *   They cannot damage anything, and stopping to ask "may I look something
 *   up?" would train the user to click Confirm without reading — which is
 *   worse than not asking, because it makes the real prompts invisible.
 *
 *   MUTATING tools (create, assign, comment, attach) never execute inside the
 *   loop. The loop stops, returns the exact call it wants to make, and waits.
 *   Nothing reaches the database until a human clicks Confirm.
 *
 * The gate is enforced HERE, on the server, not in the UI. A confirmation the
 * model could talk its way past is not a safety property — it is a suggestion.
 *
 * How this differs from a fully autonomous agent: an autonomous one would run
 * every tool as the model asks for it and report afterwards. That is the right
 * design when actions are reversible, cheap, and verifiable (a coding agent
 * whose work is in git and gated by tests). It is the wrong design when the
 * action is a durable side effect nobody can diff. The question to ask is not
 * "how smart is the model" but "how expensive is the wrong action, and who
 * would notice".
 */

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { AGENT_TOOLS, TOOL_DEFINITIONS, executeTool } from "~/server/agent/tools";

/**
 * Claude Opus 5. Thinking is on by default on this model, and `max_tokens`
 * caps thinking plus visible text together — hence the generous budget.
 */
const MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;

/**
 * A safety net, not a feature: if the model somehow never stops asking for
 * tools, this stops the loop instead of burning tokens forever. In practice
 * these requests finish in two to six turns.
 */
const MAX_TURNS = 12;

const SYSTEM_PROMPT = `You are a task-management assistant embedded in a project tool.

The data model: Users belong to at most one Team. Tasks belong to at most one Team and can be assigned to at most one User — and a User can hold at most one Task. Tasks carry comments (each written by a User) and at most one voice message.

Working rules:
- Ids are opaque. Never invent or guess one. When the user names a person or a task in prose, call listUsers or listTasks first and match by name.
- If a name is ambiguous or matches nobody, say so and ask — do not pick the closest match and proceed.
- Every write (createTask, assignTaskToUser, addCommentToTask, attachVoiceMessage) is shown to the user for approval before it runs. That is expected, not an error. Propose one step at a time and wait for the result before deciding the next.
- If the user declines an action, do not retry it or work around it. Acknowledge and ask what they would prefer.
- This app has no notion of priority or due dates. If asked for something the data model cannot express, say so plainly and suggest putting it in the description or a comment instead.

When you are done, report what actually happened in one or two plain sentences — not a restatement of the plan.`;

/** One entry in the transcript the UI renders. */
export type ChatItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | {
      id: string;
      kind: "tool_result";
      toolName: string;
      summary: string;
      isError: boolean;
    }
  | {
      id: string;
      kind: "proposal";
      toolUseId: string;
      toolName: string;
      summary: string;
      input: Record<string, unknown>;
      status: "pending" | "confirmed" | "cancelled";
      result?: string;
      isError?: boolean;
    };

type PendingCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type Conversation = {
  id: string;
  /** The API-facing history. This is what gets replayed to the model. */
  messages: Anthropic.Beta.BetaMessageParam[];
  /** The UI-facing history. Rendered by the chat component. */
  transcript: ChatItem[];
  /**
   * Set while the loop is parked waiting for a human decision.
   *
   * WHY BOTH A QUEUE AND A RESULTS ARRAY: one assistant turn may contain
   * several tool_use blocks, and the API requires a tool_result for EVERY one
   * of them in a single following user message. We therefore cannot answer
   * some now and some later. Read-only results accumulate in `results` while
   * the mutating calls wait their turn in `queue`; only when the queue is
   * empty do we send all the results back together.
   */
  pending: {
    results: Anthropic.Beta.BetaToolResultBlockParam[];
    queue: PendingCall[];
  } | null;
};

/**
 * In-memory conversation store.
 *
 * Pinned to globalThis for the same reason the Prisma client is: Next.js
 * reloads modules on every edit in dev, and a plain module-level Map would be
 * replaced mid-conversation, losing the history. Restarting the server still
 * clears everything — persistence is deliberately out of scope here. A real
 * deployment would put this in a database or Redis, because an in-memory store
 * also means conversations do not survive a deploy and cannot be shared across
 * instances.
 */
const globalForAgent = globalThis as unknown as {
  conversations: Map<string, Conversation> | undefined;
};

const conversations =
  globalForAgent.conversations ?? new Map<string, Conversation>();
globalForAgent.conversations = conversations;

/**
 * Turns an SDK error into something worth showing a person.
 *
 * `APIError.message` is the raw wire body — `400 {"type":"error","error":{...}}` —
 * which is exactly what you want in a log and exactly what you do not want in a
 * chat bubble. The parsed body carries a plain sentence ("Your credit balance is
 * too low..."), so we surface that and keep the status code for context.
 */
function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const body = error.error as { error?: { message?: string } } | undefined;
    const detail = body?.error?.message;
    if (detail) return `Anthropic API (${error.status}): ${detail}`;
  }

  return error instanceof Error ? error.message : "The model request failed";
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env and restart the dev server.",
    );
  }
  return new Anthropic();
}

export type AgentResponse =
  | { conversationId: string; status: "done"; transcript: ChatItem[] }
  | {
      conversationId: string;
      status: "pending_confirmation";
      transcript: ChatItem[];
      pending: { toolUseId: string; toolName: string; summary: string };
    };

function pendingResponse(conv: Conversation): AgentResponse {
  const next = conv.pending!.queue[0];

  return {
    conversationId: conv.id,
    status: "pending_confirmation",
    transcript: conv.transcript,
    pending: {
      toolUseId: next.id,
      toolName: next.name,
      summary: AGENT_TOOLS[next.name].describe(next.input),
    },
  };
}

/** One model call, with SDK errors translated into readable text. */
async function createMessage(client: Anthropic, conv: Conversation) {
  try {
    return await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages: conv.messages,

      /**
       * Refusal fallback. Claude Opus 5's safety classifiers can decline a
       * request; rather than returning the refusal, the API re-runs it on a
       * fallback model inside the same call. Task management will essentially
       * never trip a classifier, so this is belt-and-braces — if your account
       * rejects the beta header, delete these two lines and switch
       * `client.beta.messages` back to `client.messages`.
       */
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (error) {
    console.error("[agent] model call failed:", error);
    throw new Error(describeApiError(error));
  }
}

/**
 * ───────────────────────────────────────────────────────────────────────────
 * THE LOOP ITSELF
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Runs until the model stops requesting tools, or until it requests a write
 * and we park to ask the user.
 */
async function runLoop(conv: Conversation): Promise<AgentResponse> {
  const client = getClient();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // ── STEP 1: call the model with the whole conversation so far ──────────
    //
    // The API is stateless: every turn resends the full history. The model has
    // no memory of the previous call beyond what is in `messages`.
    const response = await createMessage(client, conv);

    /**
     * Check stop_reason BEFORE reading content. A refusal returns HTTP 200
     * with an empty or partial content array, so code that reaches straight
     * for `content[0].text` crashes on exactly the case it most needs to
     * handle.
     */
    if (response.stop_reason === "refusal") {
      conv.transcript.push({
        id: randomUUID(),
        kind: "assistant",
        text: "I can't help with that request.",
      });
      return { conversationId: conv.id, status: "done", transcript: conv.transcript };
    }

    // ── STEP 2: record the assistant turn ──────────────────────────────────
    //
    // The FULL content array goes into the history, not just the text. It
    // carries the tool_use blocks, and the next user message's tool_result
    // blocks reference them by id — drop them and the API rejects the turn.
    conv.messages.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        conv.transcript.push({
          id: randomUUID(),
          kind: "assistant",
          text: block.text,
        });
      }
    }

    // ── STEP 3: is the model done? ─────────────────────────────────────────
    if (response.stop_reason !== "tool_use") {
      return { conversationId: conv.id, status: "done", transcript: conv.transcript };
    }

    // ── STEP 4: sort the requested calls into run-now and ask-first ────────
    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
    );

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    const queue: PendingCall[] = [];

    for (const toolUse of toolUses) {
      const input = (toolUse.input ?? {}) as Record<string, unknown>;
      const tool = AGENT_TOOLS[toolUse.name];

      if (tool?.mutates) {
        // THE GATE. Nothing is executed here — the call is only recorded.
        queue.push({ id: toolUse.id, name: toolUse.name, input });

        conv.transcript.push({
          id: randomUUID(),
          kind: "proposal",
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          summary: tool.describe(input),
          input,
          status: "pending",
        });
        continue;
      }

      // Read-only: safe to run without asking.
      const { output, isError } = await executeTool(toolUse.name, input);

      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: output,
        is_error: isError,
      });

      conv.transcript.push({
        id: randomUUID(),
        kind: "tool_result",
        toolName: toolUse.name,
        summary: isError ? output : summarize(output),
        isError,
      });
    }

    // ── STEP 5: park if anything needs approval ────────────────────────────
    if (queue.length > 0) {
      conv.pending = { results, queue };
      return pendingResponse(conv);
    }

    // ── STEP 6: feed the results back and go around again ──────────────────
    //
    // All results travel in ONE user message. Splitting them across several
    // messages is rejected by the API and, on models that tolerate it, teaches
    // the model to stop issuing parallel tool calls.
    conv.messages.push({ role: "user", content: results });
  }

  conv.transcript.push({
    id: randomUUID(),
    kind: "assistant",
    text: `Stopped after ${MAX_TURNS} turns without finishing. Try breaking the request into smaller steps.`,
  });

  return { conversationId: conv.id, status: "done", transcript: conv.transcript };
}

/** Keeps tool output readable in the transcript. */
function summarize(output: string): string {
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) return `${parsed.length} result(s)`;
  } catch {
    // Not JSON — fall through to the truncated string.
  }
  return output.length > 120 ? `${output.slice(0, 120)}...` : output;
}

/** Starts a conversation, or continues an existing one with a new message. */
export async function sendMessage(
  conversationId: string | undefined,
  message: string,
): Promise<AgentResponse> {
  let conv = conversationId ? conversations.get(conversationId) : undefined;

  if (!conv) {
    conv = {
      id: randomUUID(),
      messages: [],
      transcript: [],
      pending: null,
    };
    conversations.set(conv.id, conv);
  }

  if (conv.pending) {
    throw new Error(
      "This conversation is waiting for you to confirm or cancel a proposed action.",
    );
  }

  conv.messages.push({ role: "user", content: message });
  conv.transcript.push({ id: randomUUID(), kind: "user", text: message });

  return runLoop(conv);
}

/**
 * Resolves one parked action, then either asks about the next one or resumes
 * the loop.
 *
 * Note what a cancellation sends back: a tool_result marked `is_error`, saying
 * the user declined. It is NOT silence, and NOT a fabricated success. The
 * model must know the action did not happen — otherwise its final summary
 * cheerfully reports work that was never done — and it must know a human
 * refused rather than the tool being broken, so it asks instead of retrying.
 */
export async function resolvePending(
  conversationId: string,
  toolUseId: string,
  approved: boolean,
): Promise<AgentResponse> {
  const conv = conversations.get(conversationId);

  if (!conv) throw new Error("Unknown conversation. Start a new one.");
  if (!conv.pending) throw new Error("There is no action awaiting confirmation.");

  const index = conv.pending.queue.findIndex((call) => call.id === toolUseId);
  if (index === -1) throw new Error("That action is no longer pending.");

  const [call] = conv.pending.queue.splice(index, 1);

  const proposal = conv.transcript.find(
    (item) => item.kind === "proposal" && item.toolUseId === toolUseId,
  ) as Extract<ChatItem, { kind: "proposal" }> | undefined;

  if (approved) {
    const { output, isError } = await executeTool(call.name, call.input);

    conv.pending.results.push({
      type: "tool_result",
      tool_use_id: call.id,
      content: output,
      is_error: isError,
    });

    if (proposal) {
      proposal.status = "confirmed";
      proposal.result = isError ? output : summarize(output);
      proposal.isError = isError;
    }
  } else {
    conv.pending.results.push({
      type: "tool_result",
      tool_use_id: call.id,
      content:
        "The user declined this action. It was NOT performed. Do not retry it — ask what they would like instead.",
      is_error: true,
    });

    if (proposal) {
      proposal.status = "cancelled";
      proposal.result = "Cancelled by the user";
    }
  }

  // More approvals still outstanding from the same assistant turn.
  if (conv.pending.queue.length > 0) return pendingResponse(conv);

  // Every tool_use from that turn now has a result — send them as one message
  // and let the loop continue.
  conv.messages.push({ role: "user", content: conv.pending.results });
  conv.pending = null;

  return runLoop(conv);
}
