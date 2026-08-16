"use client";

/**
 * AI ASSISTANT TAB — chat UI for the tool-calling agent
 *
 * This component is deliberately thin. It holds no conversation history of its
 * own: it POSTs to /api/agent/chat and renders whatever transcript comes back.
 * The server owns the history, the pending queue, and the confirmation gate —
 * see the note at the top of the route handler for why that matters.
 *
 * Two things distinguish this from an ordinary chat box:
 *
 *   1. A PROPOSED ACTION IS NOT A MESSAGE. When the agent wants to write to
 *      the database, it arrives as a distinct card with Confirm and Cancel
 *      buttons — not as text saying "shall I create this task?". Rendering it
 *      as prose would leave the user approving something by typing "yes", and
 *      the exact call would be whatever the model decided later. A card shows
 *      the literal arguments and returns a decision keyed to one tool_use id.
 *
 *   2. THE INPUT LOCKS WHILE A DECISION IS OUTSTANDING. The agent loop is
 *      genuinely paused mid-turn, and the API will not accept a new user
 *      message until every proposed call has a result. Disabling the box makes
 *      that state visible rather than producing a confusing server error.
 */

import { useEffect, useRef, useState } from "react";

type ChatItem =
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

type AgentResponse = {
  conversationId: string;
  status: "done" | "pending_confirmation";
  transcript: ChatItem[];
  pending?: { toolUseId: string; toolName: string; summary: string };
};

const EXAMPLES = [
  "Which users are there, and who has a task already?",
  "Create a bug-fix task called 'Fix login redirect' and assign it to Ada",
  "Add a comment on the login task explaining it blocks the release",
];

export function AiAssistantTab() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<ChatItem[]>([]);
  const [pendingToolUseId, setPendingToolUseId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, busy]);

  /** Single request path — both a message and a decision come back here. */
  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, conversationId }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Request failed");

      const result = json as AgentResponse;
      setConversationId(result.conversationId);
      setTranscript(result.transcript);
      setPendingToolUseId(result.pending?.toolUseId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!input.trim() || busy || pendingToolUseId) return;

    const message = input;
    setInput("");
    void post({ message });
  }

  return (
    <div className="space-y-3">
      <section className="flex h-[26rem] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {transcript.length === 0 && !busy && (
            <div className="space-y-2 py-6 text-center">
              <p className="text-sm text-slate-500">
                Ask in plain language. The assistant looks things up on its own
                and asks before it writes anything.
              </p>
              <div className="flex flex-col items-center gap-1">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    onClick={() => setInput(example)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 underline underline-offset-2 transition hover:text-slate-900"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {transcript.map((item) => {
            if (item.kind === "user") {
              return (
                <div key={item.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white">
                    {item.text}
                  </p>
                </div>
              );
            }

            if (item.kind === "assistant") {
              return (
                <div key={item.id} className="flex justify-start">
                  <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-3 py-2 text-sm">
                    {item.text}
                  </p>
                </div>
              );
            }

            /*
              Read-only tool calls are shown but kept visually quiet. They ran
              without asking, so the user should be able to audit them after
              the fact without them competing with the conversation.
            */
            if (item.kind === "tool_result") {
              return (
                <p
                  key={item.id}
                  className={`text-xs ${item.isError ? "text-red-600" : "text-slate-400"}`}
                >
                  {item.isError ? "⚠" : "🔍"} {item.toolName} · {item.summary}
                </p>
              );
            }

            /*
              THE PROPOSED ACTION CARD.

              The literal arguments are rendered, not a paraphrase: the user is
              approving this exact call, so a summary that quietly differed from
              the payload would make the confirmation meaningless.
            */
            return (
              <div
                key={item.id}
                className={`rounded-xl border p-3 ${
                  item.status === "pending"
                    ? "border-amber-300 bg-amber-50"
                    : item.status === "confirmed"
                      ? "border-slate-200 bg-slate-50"
                      : "border-slate-200 bg-slate-50 opacity-70"
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                  {item.status === "pending"
                    ? "Proposed action"
                    : item.status === "confirmed"
                      ? "Action performed"
                      : "Action cancelled"}
                </p>

                <p className="mt-0.5 text-sm font-medium">{item.summary}</p>

                <pre className="mt-1 overflow-x-auto rounded bg-white/70 p-2 text-[11px] text-slate-600">
                  {item.toolName}({JSON.stringify(item.input, null, 2)})
                </pre>

                {item.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() =>
                        void post({
                          decision: "confirm",
                          toolUseId: item.toolUseId,
                        })
                      }
                      disabled={busy}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() =>
                        void post({
                          decision: "cancel",
                          toolUseId: item.toolUseId,
                        })
                      }
                      disabled={busy}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {item.result && (
                  <p
                    className={`mt-1 text-xs ${item.isError ? "text-red-600" : "text-slate-500"}`}
                  >
                    {item.status === "confirmed" ? "✅ " : "🚫 "}
                    {item.result}
                  </p>
                )}
              </div>
            );
          })}

          {busy && (
            <p className="text-xs text-slate-400">Thinking...</p>
          )}

          <div ref={bottomRef} />
        </div>

        {error && (
          <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex gap-2 border-t border-slate-100 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy || pendingToolUseId !== null}
            placeholder={
              pendingToolUseId
                ? "Confirm or cancel the proposed action first..."
                : "Ask the assistant to do something..."
            }
            aria-label="Message the assistant"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim() || pendingToolUseId !== null}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
        The agent reuses this app&apos;s own GraphQL mutations as its tools,
        calling the resolver functions directly — no duplicated business logic
        and no HTTP hop. Reads run on their own; every write stops for your
        approval. Watch the server terminal to see the loop go around.
      </p>
    </div>
  );
}
