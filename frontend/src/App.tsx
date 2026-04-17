import { useEffect, useState } from "react";
import { uploadDoc, fetchDoc } from "./api";
import { DocPane } from "./components/DocPane";
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
        <DocPane file={file} reloadKey={reloadKey} />
      </main>
      {chatOpen && (
        <ChatPane
          sessionId={sessionId}
          apiKey={apiKey}
          onDocChanged={refreshDoc}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
