# DOCX AI Chat — POC

A React web app that shows a DOCX with a side-panel AI chat. Prompts like "change the title to Hey!" are routed to a Python server that uses the [SuperDoc Python SDK](https://www.superdoc.dev) + Claude tool-use to mutate the native OOXML and stream each SuperDoc tool call back to the UI in real time.

Built against the Upwork POC brief: <https://www.upwork.com/jobs/~022045229390179649961>

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
cp .env.example .env   # paste your ANTHROPIC_API_KEY (or type it into the UI instead)
.venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend (in another terminal)
cd frontend
pnpm install
pnpm dev
```

Open <http://localhost:5173>, paste your Anthropic API key on the landing page (stored only in `sessionStorage`, sent per-request as `X-Anthropic-Key` header, never persisted server-side), upload a `.docx`, and try prompts like:

- "Change the title to Hey!"
- "Make the first paragraph bold"
- "Add a bullet list with three items below the title"

## Deploy to Railway

The repo ships with a multi-stage `Dockerfile` that builds the frontend and bundles it into the Python image. FastAPI serves the built static files at `/` and the API at `/session`, `/chat/{id}`, etc.

1. Push this repo to GitHub.
2. On [railway.com](https://railway.com), "New Project" → "Deploy from GitHub repo" → pick this repo.
3. Railway auto-detects the `Dockerfile` and builds. No env vars are required if users will paste their key in the UI. If you want a fallback key server-side, set `ANTHROPIC_API_KEY` under Variables.
4. Open the generated `*.up.railway.app` URL.

## Architecture

```
Browser ──────────────► FastAPI (:8000)
  │                        │
  │  upload .docx           │ writes ./sessions/<id>/doc.docx
  │  POST /session          │
  │                        │
  │  prompt + API key       │ AsyncSuperDocClient + Anthropic
  │  POST /chat/{id}  SSE ◄─┤ loop: choose_tools → messages.create
  │                        │       → dispatch_superdoc_tool_async
  │                        │       → doc.save({"inPlace": True})
  │  GET /session/{id}/doc ─┤ streams updated bytes
  └──────► SuperDocEditor remount with new file
```

9 SuperDoc LLM tools are exposed to Claude: `superdoc_get_content`, `superdoc_search`, `superdoc_edit`, `superdoc_format`, `superdoc_create`, `superdoc_list`, `superdoc_comment`, `superdoc_track_changes`, `superdoc_mutations`.

## Engineer feedback

See [FEEDBACK.md](./FEEDBACK.md) for everything that was hard or confusing while building against the SuperDoc SDK.
