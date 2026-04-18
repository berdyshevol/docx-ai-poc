const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "http://localhost:8000" : "");

export async function uploadDoc(file: File): Promise<{ sessionId: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/session`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function fetchDoc(sessionId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/doc`);
  if (!res.ok) throw new Error(`Fetch doc failed: ${res.status}`);
  return res.blob();
}

/** Replace the session's server-side .docx with the client's current editor state. */
export async function replaceDoc(sessionId: string, blob: Blob): Promise<void> {
  const form = new FormData();
  form.append("file", blob, "doc.docx");
  const res = await fetch(`${API_BASE}/session/${sessionId}/doc`, {
    method: "PUT",
    body: form,
  });
  if (!res.ok) throw new Error(`Replace doc failed: ${res.status}`);
}

export interface ChatStreamHandlers {
  onEvent: (event: string, data: string) => void;
  onError?: (err: unknown) => void;
}

/**
 * Streams SSE from POST /chat/{id}. Uses fetch + ReadableStream because
 * `EventSource` doesn't support POST + JSON body.
 */
export async function streamChat(
  sessionId: string,
  prompt: string,
  apiKey: string,
  { onEvent, onError }: ChatStreamHandlers,
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/chat/${sessionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Anthropic-Key": apiKey,
      },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length) onEvent(event, dataLines.join("\n"));
      }
    }
  } catch (err) {
    onError?.(err);
  }
}
