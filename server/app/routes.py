from __future__ import annotations

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from . import sessions
from .agent import run_agent

router = APIRouter()


class SessionCreated(BaseModel):
    sessionId: str


@router.post("/session", response_model=SessionCreated)
async def create_session(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Expected a .docx file")
    data = await file.read()
    sess = sessions.create(data)
    return SessionCreated(sessionId=sess.id)


@router.get("/session/{session_id}/doc")
def get_doc(session_id: str):
    sess = sessions.get(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Unknown session")
    return FileResponse(
        sess.path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="doc.docx",
    )


@router.put("/session/{session_id}/doc")
async def replace_doc(session_id: str, file: UploadFile = File(...)):
    """Overwrite the session .docx with the client's current editor state.

    Called before each chat prompt so Claude works on what the user actually sees,
    not the original upload.
    """
    sess = sessions.get(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Unknown session")
    data = await file.read()
    async with sess.lock:
        sess.path.write_bytes(data)
    return {"ok": True, "bytes": len(data)}


class ChatRequest(BaseModel):
    prompt: str


@router.post("/chat/{session_id}")
async def chat(
    session_id: str,
    body: ChatRequest,
    x_anthropic_key: str | None = Header(default=None),
):
    sess = sessions.get(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Unknown session")

    async def event_stream():
        async with sess.lock:
            async for event in run_agent(sess, body.prompt, x_anthropic_key):
                yield event

    return EventSourceResponse(event_stream())


@router.post("/session/{session_id}/reset")
async def reset_history(session_id: str):
    """Clear the Claude conversation history for this session (new chat)."""
    sess = sessions.get(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Unknown session")
    async with sess.lock:
        sess.messages = []
    return {"ok": True}
