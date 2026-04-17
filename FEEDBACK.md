# Engineer feedback on building with SuperDoc

This is deliverable #3 from the POC brief — a list of everything that was hard, surprising, or confusing while building against the SuperDoc SDK and React component. Written from scratch during the build, not polished retrospectively.

## What worked well

- `@superdoc-dev/react` renders a real `.docx` as-is with a full toolbar in one JSX line. `contained` mode handles parent-sized layouts cleanly, and `onReady` fires reliably. The rendering fidelity on a simple contract-style document is high — headings, paragraphs, lists, tables, colors all look right on first load.
- `superdoc-sdk` + `choose_tools({"provider": "anthropic"})` + `dispatch_superdoc_tool_async` is the right shape. 9 first-party tools is the right scope — neither too few nor a sprawl of micro-primitives. The `get_system_prompt()` helper is a massive accelerator: dropping it into the Anthropic `system` field made Claude pick the correct tool sequence on the first try.
- The Python SDK is genuinely async-first (`AsyncSuperDocClient` as a context manager, `dispatch_superdoc_tool_async`). That paired with FastAPI + SSE was a clean integration — no threading workarounds.
- `pip install superdoc-sdk` transparently pulls the platform-specific binary (`superdoc-sdk-cli-darwin-arm64` on my Mac, `superdoc-sdk-cli-linux-x64` in the Railway Docker image). Cross-platform worked without me having to think about it.

## What was hard or surprising

### Documentation

1. **`choose_tools({"provider": "anthropic"})` is not documented.** The docs example uses `"openai"`. I had to try it to confirm `"anthropic"` works — it does, and it returns tools already in native Anthropic `{name, description, input_schema}` shape (not OpenAI-wrapped), which is the ideal ergonomic but invisible from the published docs.
2. **Python SDK quick-start doesn't show the LLM loop.** The quick-start at `docs.superdoc.dev/document-engine/sdks` shows a find-and-replace example that doesn't involve Claude/OpenAI — so a first-time reader has to stitch together the `choose_tools` + `dispatch_superdoc_tool` + LLM tool-calling loop from three separate pages. A single end-to-end Python snippet that matches the brief of this POC would have saved an hour.
3. **`SuperDocClient()` licensing ambiguity.** The class accepts `user` and timeout parameters but the docs don't explicitly say "no license key is required for local/headless use." I found out by calling it. An explicit "license needed only for X, not for Y" note in the Python quick-start would help.
4. **Top-level SDK lifecycle isn't laid out in one place.** `client.connect()` / `client.open()` / `doc.save()` / `doc.close()` / `client.dispose()` (or the async context-manager equivalents) are each mentioned somewhere but never shown as a concrete boilerplate. I read the `inspect.signature` output to confirm what was there.

### API shape surprises

5. **`doc.save({"inPlace": True})`** — the parameter is a dict, not a boolean. Easy to write `doc.save(True)` and get a cryptic error. Python convention would be `doc.save(in_place=True)` or at least `doc.save("in_place")`.
6. **Tool parameter schemas live only inside the tool description.** I tried to hand-craft a `superdoc_search` call (during pre-LLM verification) with `{"action": "find_text", "query": "..."}` and got `Missing required parameter: select`. The actual shape is a nested `{select: {type: "text", pattern: "..."}}` structure. Fine for LLMs — they read the description — but a separate machine-readable schema reference page for humans debugging would help.
7. **`superdoc-sdk-cli-*` companion binaries are an implementation detail that leaks.** `pip install superdoc-sdk` pulls `superdoc-sdk-cli-darwin-arm64` as a transitive dep. This surfaces during Docker builds (need to confirm Linux binary resolves), error messages (stack traces reference `runtime.py` → `transport.py` → subprocess), and disk usage (binary adds ~25 MB). Worth a one-line note: "The SDK delegates to a native CLI binary that ships alongside — no extra setup on your part."

### React component

8. **Package name mismatch.** The npm package is `@superdoc-dev/react`, the exported component is `SuperDocEditor` (capital D), the underlying concept is `superdoc`/`SuperDoc`. Three different casings across one surface area. I had the wrong import (`SuperdocEditor`) and got a React "component is undefined" error that's not obvious to trace.
9. **No obvious imperative reload API on the React wrapper.** After the server saves an edited `.docx`, I need the editor to re-read it. The `SuperDocRef.getInstance()` returns the SuperDoc instance but I couldn't find a documented `loadDocument(bytes)` on it — so I remount the component via `key={reloadKey}`, which throws away undo history and cursor state. Fine for a POC but wrong for production. An explicit `ref.loadDocument(file)` (or a `document` prop change triggering a diff-load) would be a big quality-of-life improvement.
10. **`document` prop takes a `File` not a `Blob` or `Uint8Array`.** When I fetched the updated doc as a `Blob` from the server, I had to wrap it in `new File([blob], "doc.docx", { type: "..." })` before passing to the editor. Accepting `Blob | File | ArrayBuffer` would be more ergonomic.
11. **`documentMode="editing"` vs `"viewing"` is documented; `"suggesting"` (tracked-changes) is mentioned but not elaborated.** For a POC this was fine, but the Upwork brief for this job implies a track-changes flow could be useful — would be nice to have a ready example.

### Friction that was mine, not SuperDoc's (for the record)

- **`sse-starlette` emits `\r\n` line terminators.** My first-pass SSE parser split on `\n\n`, so frames sat in the buffer forever. This is a generic EventSource-parser gotcha, not a SuperDoc issue, but it cost me 15 minutes.
- **Hidden `<input type="file"> + display:none` with a programmatic `.click()`** is flaky across browsers (particularly Safari and some extension setups). Replaced with a `<label>`-wrapped visually-hidden input — the standard accessible pattern.

## Bottom line

SuperDoc's premise — "skip the DOCX → HTML → hope → DOCX round-trip, edit OOXML natively with a tool-calling LLM" — is absolutely the right one, and the core API delivers. The rough edges are all documentation and ergonomic polish, not architectural. With a dedicated Python-SDK-with-Claude quick-start page and an imperative reload API on the React wrapper, the developer experience would go from "good once you figure it out" to "the obvious way to build DOCX AI products."
