import { useState } from "react";
import type { AssistantTurn, ToolEvent, Turn } from "../types";
import { streamChat } from "../api";
import { ToolUseRow } from "./ToolUseRow";

interface Props {
  sessionId: string;
  apiKey: string;
  onBeforePrompt?: () => Promise<void>;
  onDocChanged: () => void;
  onClose: () => void;
}

export function ChatPane({
  sessionId,
  apiKey,
  onBeforePrompt,
  onDocChanged,
  onClose,
}: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    setBusy(true);

    const userTurn: Turn = { id: crypto.randomUUID(), kind: "user", text: prompt };
    const assistantId = crypto.randomUUID();
    const assistantTurn: AssistantTurn = {
      id: assistantId,
      kind: "assistant",
      text: "",
      tools: [],
      done: false,
    };
    setTurns((t) => [...t, userTurn, assistantTurn]);

    try {
      await onBeforePrompt?.();
    } catch (err) {
      console.error("Failed to sync editor state to server", err);
    }

    const toolMap = new Map<string, ToolEvent>();
    const bumpAssistant = (mut: (a: AssistantTurn) => AssistantTurn) => {
      setTurns((t) =>
        t.map((turn) =>
          turn.id === assistantId && turn.kind === "assistant" ? mut(turn) : turn,
        ),
      );
    };

    await streamChat(sessionId, prompt, apiKey, {
      onEvent: (event, rawData) => {
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(rawData);
        } catch {
          // non-JSON payload; keep empty object
        }
        if (event === "assistant_text") {
          const text = typeof data.text === "string" ? data.text : "";
          bumpAssistant((a) => ({ ...a, text: a.text + text }));
        } else if (event === "tool_start") {
          const name = String(data.name ?? "tool");
          const id = String(data.id ?? crypto.randomUUID());
          const ev: ToolEvent = { id, name, status: "running", input: data.input };
          toolMap.set(id, ev);
          bumpAssistant((a) => ({ ...a, tools: [...a.tools, ev] }));
        } else if (event === "tool_end") {
          const id = String(data.id ?? "");
          const resultSummary =
            typeof data.result_summary === "string" ? data.result_summary : undefined;
          bumpAssistant((a) => ({
            ...a,
            tools: a.tools.map((t) =>
              t.id === id ? { ...t, status: "done", resultSummary } : t,
            ),
          }));
        } else if (event === "error") {
          bumpAssistant((a) => ({
            ...a,
            text: a.text + `\n[error] ${data.message ?? "unknown"}`,
            done: true,
          }));
        } else if (event === "done") {
          bumpAssistant((a) => ({ ...a, done: true }));
        }
      },
      onError: (err) => {
        bumpAssistant((a) => ({
          ...a,
          text: a.text + `\n[stream failed] ${String(err)}`,
          done: true,
        }));
      },
    });

    setBusy(false);
    onDocChanged();
  }

  return (
    <aside className="chat-pane">
      <header className="chat-header">
        <span className="chat-title">✨ AI Chat</span>
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </header>

      <div className="chat-scroll">
        {turns.map((turn) =>
          turn.kind === "user" ? (
            <div key={turn.id} className="bubble user-bubble">
              {turn.text}
            </div>
          ) : (
            <div key={turn.id} className="assistant-turn">
              <div className="assistant-avatar">🤖</div>
              <div className="assistant-body">
                {turn.tools.map((t) => (
                  <ToolUseRow key={t.id} event={t} />
                ))}
                {!turn.done && (
                  <div className="tool-row tool-running">
                    <span className="spinner" aria-hidden="true" />
                    <span className="tool-label">Thinking...</span>
                  </div>
                )}
                {turn.text && <div className="assistant-text">{turn.text}</div>}
              </div>
            </div>
          ),
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What can I change?"
          disabled={busy}
        />
        <div className="chat-footer">
          <span className="model-label">Claude Sonnet 4.6</span>
          <button type="submit" disabled={busy || !input.trim()}>
            ↑
          </button>
        </div>
      </form>
    </aside>
  );
}
