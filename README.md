# DOCX AI Chat — POC

A React web app that shows a DOCX with a side-panel AI chat. Prompts like "change the title to Hey!" are routed to a Python server that uses the [SuperDoc Python SDK](https://www.superdoc.dev) + Claude tool-use to mutate the native OOXML and stream each SuperDoc tool call back to the UI in real time.

Built against the Upwork POC brief: <https://www.upwork.com/jobs/~022045229390179649961>

## 🔗 Live demo

**<https://docx-ai-poc.onrender.com>**

Paste your own Anthropic API key on the landing page (stored only in `sessionStorage`, never on the server), upload a `.docx`, and try prompts like "change the title to Hey!". Hosted on Render's free plan — first request after 15 min idle cold-starts in ~30 s.

## Status

### ✅ Implemented and verified end-to-end

- **Upload `.docx` → render in-browser** via `@superdoc-dev/react`'s `SuperDocEditor` with its full toolbar (undo/redo, fonts, formatting, tables, lists, track-changes toggles). Renders native OOXML — no HTML intermediate.
- **Side-panel AI chat** — collapsible, matches the mockup: user bubbles right, assistant turn with ✨ avatar, friendly tool rows (`superdoc_search` → "Search...", `superdoc_edit` → "Editing...", etc.) with ✓ / ⚠ status icons, "What can I change?" input, "Claude Sonnet 4.6" model label.
- **Thinking animations** — bouncing three-dot typing indicator while waiting for Claude's first response, CSS-ring spinner on each in-flight tool call, ✓ on completion.
- **Python Claude tool-use loop** — `AsyncSuperDocClient` + `choose_tools({"provider": "anthropic"})` (returns native Anthropic schema, no translation) + `dispatch_superdoc_tool_async` wired into a bounded iterative loop with `get_system_prompt()` guiding the model. All 9 SuperDoc LLM tools available to Claude.
- **SSE streaming of tool events** — `tool_start` / `tool_end` / `assistant_text` / `done` pushed to the chat panel in real time as Claude works. Each call uses Anthropic's stable `tool_use_id` so start/end pair up correctly.
- **DOCX round-trip** — `doc.save({"inPlace": True})` on completion, frontend fetches updated bytes, editor re-renders. Verified: prompt "change title to Hello" → `superdoc_get_content` + `superdoc_edit` → on-disk XML updated → editor shows "Hello".
- **Conversation history preserved across turns** — server keeps a per-session Anthropic `messages[]` (including tool_use + tool_result blocks). Follow-up prompts like "replace the title with variant 2" correctly reference earlier assistant messages.
- **"New chat" button** clears server-side history (`POST /session/{id}/reset`) and local UI turns, so users can start a fresh conversation without re-uploading the document.
- **Direct UI edits preserved through chat** — before each prompt, the frontend calls `SuperDoc.exportEditorsToDOCX()` and PUTs the current editor bytes to the server. Claude always edits what the user actually sees, and user edits don't get overwritten by stale server state.
- **Per-session key input UX** — password field on the landing page, stored only in `sessionStorage`, sent per-request as `X-Anthropic-Key` header, never logged or persisted server-side. Server can also fall back to `ANTHROPIC_API_KEY` from `.env` if set (disabled on the Render demo to protect the maintainer's key).
- **Viewport-pinned layout** — doc pane scrolls independently on the left, chat messages scroll in the middle of the right pane, chat input is glued to the bottom of the viewport regardless of document length.
- **Per-session `asyncio.Lock`** so concurrent prompts on the same doc can't race.
- **Tuned for tiny-instance deploys** — `AsyncSuperDocClient` instantiated with `startup_timeout_ms=30_000` and `watchdog_timeout_ms=60_000`; sufficient for Render free-plan (0.1 CPU, 512 MB).
- **Deploy-ready, deployed** — multi-stage Dockerfile (Node build → Python runtime), FastAPI mounts the built frontend at `/` for same-origin deploys. `render.yaml` Blueprint + `railway.json` both included. Live on Render at the URL above.

### ⏳ Not yet implemented (known gaps)

- **Demo video** — deliverable #2 from the brief; not recorded yet.
- **Automated tests / CI** — no `pytest` for the agent loop, no CI pipeline. Frontend `tsc -b` passes but isn't wired into CI.
- **Imperative editor reload** — current implementation remounts the editor via a `key={reloadKey}` bump, which throws away undo history and cursor position. Should switch to a `ref.loadDocument(bytes)` API if/when SuperDoc exposes one.
- **Download edited `.docx` button** — backend serves `GET /session/{id}/doc`, but no UI button for the user to download the result.
- **Abort / cancel mid-prompt** — once a prompt is sent, you wait it out. No stop button, no client-side `AbortController` on the fetch.
- **Persistent session state** — sessions and conversation history live in memory. Server restart wipes everything. Fine for a demo, not for production.
- **Session TTL / cleanup** — `.sessions/<id>/doc.docx` files accumulate with no cleanup.
- **Multi-user auth** — zero auth. Anyone hitting the deployed URL can create sessions. Acceptable for a single-user demo with pasted API keys, but flag it when sharing the link.
- **Token-by-token assistant text** — currently streamed at the content-block level (one full text block per SSE event). Token streaming would require `messages.stream` instead of `messages.create`.
- **Track-changes / suggesting mode** — SuperDoc supports `documentMode="suggesting"` but this POC uses `"editing"` only. Natural next step for a review workflow.
- **Error UI polish** — SSE disconnect, 401 bad key, Anthropic 429 rate limits: currently surface as terse in-bubble error text. No toast system, no retry button.
- **Rate-limit / cost guardrails** — no per-session token budget, no backoff beyond what the Anthropic SDK does by default. A looping agent can burn through a rate-limit quickly on a large doc.
- **Render GitHub App** not connected to the repo — pushes don't auto-deploy yet; each release is triggered with a manual `POST /v1/services/{id}/deploys` via the Render API.

## Stack

- **Frontend**: Vite + React 19 + TypeScript, [`@superdoc-dev/react`](https://docs.superdoc.dev/getting-started/frameworks/react) for the editor
- **Backend**: FastAPI + [`superdoc-sdk`](https://pypi.org/project/superdoc-sdk/) + Anthropic `claude-sonnet-4-6`
- **Transport**: Server-Sent Events stream `tool_start` / `tool_end` / `assistant_text` / `done` events to the chat panel

## Local dev

Prereqs: Node 20+, pnpm, Python 3.12+.

```bash
# Backend
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # optional: paste ANTHROPIC_API_KEY here (otherwise enter it in the UI)
.venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend (in another terminal)
cd frontend
pnpm install
pnpm dev
```

Open <http://localhost:5173>, paste your Anthropic API key on the landing page (stored only in `sessionStorage`, sent per-request as `X-Anthropic-Key` header, never persisted server-side), upload a `.docx`, and try prompts like:

- "Change the title to Hey!"
- "Make the first paragraph bold"
- "Read the doc and suggest 3 titles that match the content" → then "Replace the title with option 2" (tests conversation memory)

## Deploy

The repo ships with a multi-stage `Dockerfile` that builds the frontend and bundles it into the Python image. FastAPI serves the built static files at `/` and the API at `/session`, `/chat/{id}`, etc. — so one URL, no CORS config needed.

### Render (Blueprint — easiest)

`render.yaml` in the repo root declares a single web service with the Dockerfile, health check, and port. On [Render](https://dashboard.render.com/blueprints):

1. **New → Blueprint** → connect the GitHub repo **`berdyshevol/docx-ai-poc`**.
2. Render reads `render.yaml` and creates the `docx-ai-poc` web service on the free plan.
3. (Optional) set `ANTHROPIC_API_KEY` in the service's **Environment** tab for a server-side fallback. Not required — users can paste their key in the UI.
4. Wait ~3 min for the Docker build. Visit the `*.onrender.com` URL.

> **Free tier note:** services spin down after 15 minutes of inactivity and the next request takes ~30 seconds to cold-start. Upgrade to Starter ($7/mo) for always-on.

### Railway

Also supported. `railway.json` is in the repo root. On [railway.com](https://railway.com): **New Project → Deploy from GitHub repo → pick this repo**. Railway auto-detects the `Dockerfile`. Same optional `ANTHROPIC_API_KEY` env var.

## Architecture

```
Browser ─────────────────────► FastAPI (:8000)
   │                                │
   │  upload .docx                   │  writes ./sessions/<id>/doc.docx
   │  POST /session                  │
   │                                │
   │  per-prompt sync of UI edits    │  overwrites ./sessions/<id>/doc.docx
   │  PUT  /session/{id}/doc         │
   │                                │
   │  user prompt + X-Anthropic-Key  │  AsyncSuperDocClient + AsyncAnthropic
   │  POST /chat/{id}        SSE ◄──┤  loop {
   │                                │     messages.create(history + prompt, tools)
   │                                │     → stream tool_start / tool_end events
   │                                │     → dispatch_superdoc_tool_async(doc, ...)
   │                                │     → append tool_result to history
   │                                │   } until stop_reason != "tool_use"
   │                                │   → doc.save({"inPlace": True})
   │                                │   → session.messages = updated history
   │                                │
   │  GET /session/{id}/doc ────────┤  streams the updated bytes
   │                                │
   │  new conversation               │  session.messages = []
   │  POST /session/{id}/reset       │
   │                                │
   └──► SuperDocEditor remount with fresh bytes (key={reloadKey})
```

9 SuperDoc LLM tools are exposed to Claude:
`superdoc_get_content`, `superdoc_search`, `superdoc_edit`, `superdoc_format`, `superdoc_create`, `superdoc_list`, `superdoc_comment`, `superdoc_track_changes`, `superdoc_mutations`.

## Engineer feedback

See [FEEDBACK.md](./FEEDBACK.md) for everything that was hard or confusing while building against the SuperDoc SDK (deliverable #3 from the Upwork brief).
