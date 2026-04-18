import { useEffect, useRef, useState } from "react";
import { uploadDoc, fetchDoc, replaceDoc } from "./api";
import { DocPane, type DocPaneHandle } from "./components/DocPane";
import { ChatPane } from "./components/ChatPane";
import "./App.css";

const KEY_STORAGE = "anthropic_api_key";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [apiKey, setApiKey] = useState<string>(
    () => sessionStorage.getItem(KEY_STORAGE) ?? "",
  );
  const docRef = useRef<DocPaneHandle>(null);

  useEffect(() => {
    if (apiKey) sessionStorage.setItem(KEY_STORAGE, apiKey);
  }, [apiKey]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const { sessionId: sid } = await uploadDoc(f);
      setSessionId(sid);
      setFile(f);
      setReloadKey((k) => k + 1);
    } catch (err) {
      alert(`Upload failed: ${String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  async function syncDocToServer() {
    if (!sessionId) return;
    const blob = await docRef.current?.exportDocx();
    if (!blob) return;
    await replaceDoc(sessionId, blob);
  }

  async function refreshDoc() {
    if (!sessionId) return;
    try {
      const blob = await fetchDoc(sessionId);
      const updated = new File([blob], file?.name ?? "doc.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      setFile(updated);
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to refresh doc", err);
    }
  }

  function clearApiKey() {
    sessionStorage.removeItem(KEY_STORAGE);
    setApiKey("");
  }

  if (!sessionId || !file) {
    const keyValid = apiKey.trim().startsWith("sk-ant-");
    const canUpload = keyValid && !uploading;
    return (
      <div className="landing">
        <div className="landing-card">
          <h1>DOCX AI Chat — POC</h1>
          <p className="landing-sub">
            Paste your Anthropic API key, then upload a <code>.docx</code> to begin.
          </p>

          <div className="deploy-banner">
            <span className="dot" />
            Live at{" "}
            <a
              href="https://docx-ai-poc.onrender.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              docx-ai-poc.onrender.com
            </a>
          </div>

          <label className="field">
            <span>Anthropic API key</span>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="hint">
            Stored in your browser's <code>sessionStorage</code> only — cleared when
            you close the tab. Sent per-request as <code>X-Anthropic-Key</code>{" "}
            header; the server never persists it.
          </p>

          <label
            className={`file-label ${canUpload ? "" : "disabled"}`}
            aria-disabled={!canUpload}
          >
            {uploading ? "Uploading..." : "Choose .docx"}
            <input
              type="file"
              accept=".docx"
              onChange={onPickFile}
              disabled={!canUpload}
            />
          </label>
          {!keyValid && apiKey.length > 0 && (
            <p className="warn">Key should start with <code>sk-ant-</code>.</p>
          )}
        </div>

        <div className="status-card">
          <h2>What's in this POC</h2>

          <h3 className="status-h good">✅ Implemented &amp; verified</h3>
          <ul>
            <li>
              Upload <code>.docx</code> → render via <code>@superdoc-dev/react</code>{" "}
              with full toolbar (native OOXML, not HTML)
            </li>
            <li>
              Side-panel AI chat with live tool rows (<code>Search…</code>,{" "}
              <code>Editing…</code>, ✓ / ⟳ / ⚠) streamed over SSE
            </li>
            <li>
              Python server runs a Claude <code>claude-sonnet-4-6</code>{" "}
              tool-use loop with all 9 SuperDoc LLM tools
            </li>
            <li>
              DOCX round-trip: prompt → <code>superdoc_edit</code> →{" "}
              <code>doc.save()</code> → editor reloads with the new content
            </li>
            <li>
              API key pasted in the browser only, sent as{" "}
              <code>X-Anthropic-Key</code> header, never persisted server-side
            </li>
            <li>
              Multi-stage <code>Dockerfile</code> for one-URL Railway / Render deploy
            </li>
            <li>
              Live demo deployed on Render:{" "}
              <a
                href="https://docx-ai-poc.onrender.com"
                target="_blank"
                rel="noopener noreferrer"
                className="live-link"
              >
                docx-ai-poc.onrender.com
              </a>
            </li>
          </ul>

          <h3 className="status-h todo">⏳ Not yet implemented</h3>
          <ul>
            <li>Demo video (Upwork deliverable #2)</li>
            <li>Automated tests / CI</li>
            <li>
              Imperative editor reload (currently remount-via-<code>key</code>;
              loses undo history)
            </li>
            <li>Download-edited-<code>.docx</code> button in the UI</li>
            <li>Abort / cancel mid-prompt</li>
            <li>Session TTL, auth, rate-limit guardrails (single-user POC)</li>
            <li>Token-by-token text streaming (currently block-level)</li>
            <li>Track-changes / suggesting mode</li>
          </ul>

          <p className="status-links">
            <a
              href="https://github.com/berdyshevol/docx-ai-poc"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub source
            </a>
            {" · "}
            <a
              href="https://github.com/berdyshevol/docx-ai-poc/blob/main/FEEDBACK.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              SuperDoc engineer feedback
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${chatOpen ? "chat-open" : "chat-closed"}`}>
      <main className="main-pane">
        <div className="top-toolbar">
          <button className="ai-chat-toggle" onClick={() => setChatOpen((v) => !v)}>
            ✨ AI Chat
          </button>
          <button className="key-reset" onClick={clearApiKey} title="Forget API key">
            Reset key
          </button>
        </div>
        <DocPane ref={docRef} file={file} reloadKey={reloadKey} />
      </main>
      {chatOpen && (
        <ChatPane
          sessionId={sessionId}
          apiKey={apiKey}
          onBeforePrompt={syncDocToServer}
          onDocChanged={refreshDoc}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
