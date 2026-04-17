export type ToolEventStatus = "running" | "done" | "error";

export interface ToolEvent {
  id: string;
  name: string;
  status: ToolEventStatus;
  input?: unknown;
  resultSummary?: string;
}

export interface AssistantTurn {
  id: string;
  kind: "assistant";
  text: string;
  tools: ToolEvent[];
  done: boolean;
}

export interface UserTurn {
  id: string;
  kind: "user";
  text: string;
}

export type Turn = UserTurn | AssistantTurn;

export interface ServerSentEvent {
  event: "assistant_text" | "tool_start" | "tool_end" | "error" | "done";
  data: string;
}
