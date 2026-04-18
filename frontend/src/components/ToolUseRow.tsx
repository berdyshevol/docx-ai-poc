import type { ToolEvent } from "../types";

const FRIENDLY: Record<string, string> = {
  superdoc_get_content: "Reading...",
  superdoc_search: "Search...",
  superdoc_edit: "Editing...",
  superdoc_format: "Format...",
  superdoc_create: "Creating...",
  superdoc_list: "List...",
  superdoc_comment: "Comment...",
  superdoc_track_changes: "Review...",
  superdoc_mutations: "Applying...",
};

export function toolLabel(name: string): string {
  return FRIENDLY[name] ?? name.replace(/^superdoc_/, "") + "...";
}

export function ToolUseRow({ event }: { event: ToolEvent }) {
  const cls = `tool-row tool-${event.status}`;
  return (
    <div className={cls}>
      {event.status === "running" ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        <span className="tool-icon">
          {event.status === "done" ? "✓" : "⚠"}
        </span>
      )}
      <span className="tool-label">{toolLabel(event.name)}</span>
    </div>
  );
}
