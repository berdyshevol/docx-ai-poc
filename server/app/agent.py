"""Claude <-> SuperDoc tool-use loop, streamed as SSE events."""
from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator

from anthropic import AsyncAnthropic
from superdoc import (
    AsyncSuperDocClient,
    choose_tools,
    dispatch_superdoc_tool_async,
    get_system_prompt,
)

from .sessions import Session

MODEL = "claude-sonnet-4-6"
MAX_ITERATIONS = 8
MAX_TOKENS = 4096


def _serialize_content(blocks: Any) -> list[dict[str, Any]]:
    """Convert Anthropic response content blocks to plain dicts for history storage."""
    out: list[dict[str, Any]] = []
    for b in blocks:
        if hasattr(b, "model_dump"):
            out.append(b.model_dump())
        else:
            out.append(b)  # already a dict
    return out


def _sse(event: str, payload: dict[str, Any]) -> dict[str, str]:
    return {"event": event, "data": json.dumps(payload)}


def _summarize(result: Any, limit: int = 160) -> str:
    text = result if isinstance(result, str) else json.dumps(result, default=str)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _result_for_anthropic(result: Any, limit: int = 8000) -> str:
    text = result if isinstance(result, str) else json.dumps(result, default=str)
    return text if len(text) <= limit else text[: limit - 1] + "…"


async def run_agent(
    session: Session,
    prompt: str,
    api_key: str | None = None,
) -> AsyncIterator[dict]:
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        yield _sse(
            "error",
            {"message": "Missing Anthropic API key — paste it on the landing page."},
        )
        return

    anthropic = AsyncAnthropic(api_key=key)
    tools = choose_tools({"provider": "anthropic"})["tools"]
    system_prompt = get_system_prompt()

    # Start from the session's prior history + this turn's user prompt.
    # We mutate a local copy; only commit back to session.messages on success.
    messages: list[dict[str, Any]] = list(session.messages)
    messages.append({"role": "user", "content": prompt})

    async with AsyncSuperDocClient(
        startup_timeout_ms=30_000,
        watchdog_timeout_ms=60_000,
    ) as client:
        doc = await client.open({"doc": str(session.path)})
        try:
            for _ in range(MAX_ITERATIONS):
                resp = await anthropic.messages.create(
                    model=MODEL,
                    system=system_prompt,
                    tools=tools,
                    messages=messages,
                    max_tokens=MAX_TOKENS,
                )

                for block in resp.content:
                    if block.type == "text" and block.text:
                        yield _sse("assistant_text", {"text": block.text})

                # Always record the assistant turn in history (even on final end_turn).
                messages.append(
                    {"role": "assistant", "content": _serialize_content(resp.content)}
                )

                if resp.stop_reason != "tool_use":
                    break

                tool_results: list[dict[str, Any]] = []
                for block in resp.content:
                    if block.type != "tool_use":
                        continue
                    call_id = block.id
                    name = block.name
                    args = block.input or {}
                    yield _sse(
                        "tool_start",
                        {"id": call_id, "name": name, "input": args},
                    )
                    try:
                        result = await dispatch_superdoc_tool_async(doc, name, args)
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": call_id,
                                "content": _result_for_anthropic(result),
                            }
                        )
                        yield _sse(
                            "tool_end",
                            {
                                "id": call_id,
                                "name": name,
                                "result_summary": _summarize(result),
                            },
                        )
                    except Exception as exc:
                        err_msg = f"{type(exc).__name__}: {exc}"
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": call_id,
                                "content": err_msg,
                                "is_error": True,
                            }
                        )
                        yield _sse(
                            "tool_end",
                            {
                                "id": call_id,
                                "name": name,
                                "status": "error",
                                "result_summary": err_msg,
                            },
                        )

                messages.append({"role": "user", "content": tool_results})

            await doc.save({"inPlace": True})
            # Commit the updated conversation back to the session so the next
            # prompt can reference everything that just happened.
            session.messages = messages
            yield _sse("done", {"ok": True})
        except Exception as exc:
            yield _sse("error", {"message": f"{type(exc).__name__}: {exc}"})
        finally:
            try:
                await doc.close({})
            except Exception:
                pass
