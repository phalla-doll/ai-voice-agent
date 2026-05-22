# Implementation Plan — OpenCode Voice Agent

A living checklist for building the OpenCode + Voicebox voice mode.
Tick items as they are completed. Each phase is independently runnable.

---

## Phase 0 — Prerequisites & Environment

**Goal:** Local machine is ready to develop and run the stack.

- [x] Install Node.js 20+ (`brew install node`) — v26.0.0
- [x] Install `pnpm` or confirm `npm` works (`node -v`, `npm -v`) — npm 11.12.1
- [x] Install OpenCode CLI (`npm install -g opencode-ai`) and verify `opencode --help` — v1.15.7
- [x] Install `ffmpeg` (`brew install ffmpeg`) — v8.1.1
- [x] Install `sox` (`brew install sox`) — needed by `node-record-lpcm16`
- [ ] Grant microphone permission to your terminal app (System Settings → Privacy & Security → Microphone)
- [ ] Confirm a working text editor / IDE (VS Code recommended)

**Done when:** `node -v`, `opencode --help`, `ffmpeg -version`, `sox --version` all succeed.

---

## Phase 1 — Voicebox Local Server

**Goal:** Voicebox is running locally and STT/TTS endpoints respond.

- [x] ~~Clone Voicebox~~ — using **desktop app** instead (already installed)
- [x] Start server: desktop app exposes `http://127.0.0.1:17493`
- [x] Confirm it listens on `http://127.0.0.1:17493`
- [x] Manually test `POST /transcribe` with a sample WAV via `curl`
- [x] Manually test `POST /speak` with sample JSON via `curl`
- [x] Note actual response shapes in `docs/voicebox-api.md`

**Done when:** Both endpoints return expected output from `curl`.

---

## Phase 2 — Project Scaffold

**Goal:** A runnable TypeScript project with the agreed folder layout.

- [x] `npm init -y`
- [x] Install dev deps: `npm i -D typescript tsx @types/node`
- [x] Install runtime deps: `npm i undici dotenv`
- [x] `npx tsc --init` (target ES2022, module NodeNext, strict true)
- [x] Create folders: `src/{audio,voicebox,opencode,formatter,queue,hotkeys}`
- [x] Add `src/index.ts` with a `console.log("voice agent ready")`
- [x] Add npm scripts: `dev` (`tsx src/index.ts`), `build` (`tsc`), `start` (`node dist/index.js`)
- [x] Create `.env.example` with `VOICEBOX_URL=http://127.0.0.1:17493`
- [x] Add `.gitignore` (`node_modules`, `dist`, `.env`, `*.wav` tmp files)
- [ ] First commit

**Done when:** `npm run dev` prints the ready message.

---

## Phase 3 — Voicebox Client (STT + TTS)

**Goal:** Thin typed wrapper around Voicebox HTTP endpoints.

- [x] `src/voicebox/client.ts` — shared `fetch` wrapper, base URL from env
- [x] `src/voicebox/stt.ts` — `transcribe(wavPath: string): Promise<TranscriptionResult>`
- [x] `src/voicebox/tts.ts` — `speak(text: string): Promise<Buffer>` (returns audio bytes)
- [x] Small CLI test: `npm run dev -- transcribe ./sample.wav`
- [x] Small CLI test: `npm run dev -- speak "hello world"` → saves `tmp/out.wav`

**Done when:** Round-trip works with a hand-picked sample WAV.

---

## Phase 4 — Audio Recording & Playback

**Goal:** Capture mic input and play TTS output from Node.

- [x] ~~Install `node-record-lpcm16` and `speaker`~~ — using **child_process spawn** of `sox` (record) + `afplay` (playback). No native deps, more reliable.
- [x] `src/audio/recorder.ts` — `startRecording()` + `recordFor()`, writes 16kHz mono WAV
- [x] `src/audio/playback.ts` — `playFile()` + `playBuffer()` via `afplay`
- [x] CLI test: record 2s → save WAV → play it back
- [ ] Confirm mic device selection works (default vs. specific device)

**Done when:** You can record yourself and hear the playback.

---

## Phase 5 — End-to-End Hello Loop (MVP)

**Goal:** The smallest possible voice loop, no streaming yet.

```txt
press ENTER to start → record 5s → STT → print text → fixed TTS reply → play
```

- [x] Wire recorder → `stt.transcribe()` → log text
- [x] Pass text to a stub that returns `"You said: <text>"`
- [x] Pass reply through `tts.speak()` → `playback.playBuffer()`
- [x] Measure end-to-end latency, log to console (per-stage timings)
- [ ] Commit as `feat: phase-1 mvp loop`

**Done when:** Speaking a sentence yields a spoken reply.

---

## Phase 6 — OpenCode Integration

**Goal:** Send transcribed text to a real OpenCode session and capture replies.

- [x] Decide integration surface: **CLI subprocess** (`opencode run --format json`) — simplest, no server needed
- [x] `src/opencode/ask.ts` — spawn OpenCode, parse NDJSON, collect text parts
- [ ] `src/opencode/stream.ts` — streaming variant (deferred to Phase 8)
- [x] Replace stub from Phase 5 with real OpenCode call (still non-streaming)
- [x] Handle errors: non-zero exit → throws with stderr tail
- [x] Use `-c` (continue session) in loop so conversation has memory

**Done when:** Voice prompt produces a real OpenCode response, spoken back.

---

## Phase 7 — Push-to-Talk Hotkey

**Goal:** Hold a key to record, release to send.

- [x] ~~Evaluate `iohook` vs. Swift helper for global hotkey~~ — deferred. Both need accessibility permissions; too heavy for MVP.
- [x] `src/cli/repl.ts` — **terminal REPL** with SPACE-to-toggle recording, Q to quit (works without permissions or native deps)
- [x] Wire to recorder start/stop (via `startRecording()`)
- [x] Show a console indicator while recording / thinking
- [x] Handle accidental zero-length recordings (empty transcription is skipped)
- [ ] **Future:** true global Option+Space via Swift helper app (Phase 12 stretch)

**Done when:** Holding Option+Space anywhere on macOS records, release transcribes.

---

## Phase 8 — Response Streaming

**Goal:** Speak while OpenCode is still generating.

- [x] Switch OpenCode integration to streamed tokens → `src/opencode/stream.ts`
- [x] `src/formatter/chunker.ts` — emits chunks on sentence end / paragraph break
- [x] `src/formatter/markdown.ts` — strips emphasis, links, headings, list bullets, inline code
- [x] Skip code fences (drops content between ``` ... ```)
- [ ] Skip tables / stack traces / terminal logs (future polish)
- [x] Unit tests for chunker with sample streams (`src/formatter/chunker.test.ts`)

**Done when:** First spoken token < 1.5s after OpenCode begins replying.

---

## Phase 9 — Speech Queue

**Goal:** FIFO TTS playback, no overlapping audio.

- [x] `src/queue/speechQueue.ts` — enqueue text; TTS runs in parallel, playback strictly FIFO
- [ ] Debounce tiny chunks (< N chars) — TBD if it becomes a problem
- [x] Expose `cancel()` to stop future playback (current playback stops at next chunk boundary)
- [ ] Logs: chunk in, audio out, queue depth (basic timings logged in REPL for now)

**Done when:** Rapidly enqueuing 10 chunks plays them in order, no overlap.

---

## Phase 10 — Interruption / Barge-In

**Goal:** User starts speaking → assistant stops instantly.

- [ ] Simple VAD on mic stream (`src/audio/vad.ts`) — energy threshold to start
- [ ] On VAD trigger: `speechQueue.cancel()`, kill current playback, start recording
- [ ] Target interrupt latency < 200ms
- [ ] Avoid false triggers from speaker bleed (test with headphones first)

**Done when:** Talking over the assistant stops it mid-sentence reliably.

---

## Phase 11 — Polish & Robustness

- [ ] Config file (`.env` + `config.ts`): voice profile, model choices, hotkey
- [ ] Structured logging with timestamps + latency per stage
- [ ] Graceful shutdown (Ctrl+C cleans temp files, kills child processes)
- [ ] Error toasts in console for STT/TTS/OpenCode failures
- [ ] README quickstart updated with actual run instructions

---

## Phase 12 — Stretch Goals (optional)

- [ ] AI cleanup layer between STT and OpenCode (filler-word removal)
- [ ] Multiple voice personalities (code review / debug / assistant)
- [ ] Wake word detection
- [ ] Conversation mode (no push-to-talk)
- [ ] Electron/Tauri tray app shell

---

## Latency Targets (from README)

| Stage              | Target   | Measured |
|--------------------|----------|----------|
| STT                | < 700ms  |          |
| First spoken token | < 1.5s   |          |
| Interrupt response | < 200ms  |          |

Fill in the "Measured" column as you progress.

---

## Open Questions

- [x] Exact Voicebox API response shape — documented in `docs/voicebox-api.md`
- [x] Does OpenCode expose a stable streaming API? — **yes**: `opencode run --format json` streams NDJSON events (`step_start`, `text`, `step_finish`). Parse stdout line-by-line.
- [x] Best Node mic library on Apple Silicon — using `sox`/`afplay` via spawn, no Node mic library needed
- [x] Global hotkey — **deferred**; using terminal REPL with SPACE toggle for now. Swift helper is the path when needed.

---

## Decision Log

Record non-obvious choices here as you make them. Format:

`YYYY-MM-DD — <decision> — <reason>`

- 2026-05-22 — Use TypeScript core, defer Swift helper — README recommends TS stack; Swift only for hotkeys if `iohook` proves flaky.
- 2026-05-22 — Use **Voicebox desktop app** (not CLI clone) — already installed; exposes the same `127.0.0.1:17493` API.
- 2026-05-22 — TTS flow is **3-step async**: `POST /speak` → poll `GET /history/{id}` until `status=completed` → `GET /audio/{id}`. Polling at 100ms intervals; SSE via `/generate/{id}/status` is available if we need lower latency later.
- 2026-05-22 — Default voice profile = `"Heart"` (Kokoro engine) — only profile that ships with the desktop app. Make configurable via env later.
- 2026-05-22 — Use **native `fetch`** for multipart STT uploads, not `undici.request`. The `undici.request` + `FormData`/`Blob` combo hung indefinitely; native `fetch` works. JSON calls still use `undici`.
- 2026-05-22 — **Stick with Kokoro for MVP**, defer Qwen 1.7B. Qwen load via API hung indefinitely (queued generation never started). MPS is active in the Voicebox UI but the API loader is wedged. Kokoro is ~350ms TTS and "good enough" per README guidance for Apple Silicon.
- 2026-05-22 — **Skip native Node audio libs**; spawn `sox` for recording and `afplay` for playback. Avoids `node-record-lpcm16` / `speaker` native-build flakiness. macOS-only — revisit if we ever need cross-platform.
- 2026-05-22 — OpenCode integration via **CLI subprocess** (`opencode run --format json`), not a plugin or HTTP server. Output is NDJSON: `step_start` → 1+ `text` parts → `step_finish` with tokens/cost. Loop uses `-c` so conversation has memory across turns.
- 2026-05-22 — Push-to-talk = **terminal REPL with SPACE toggle**, not a global hotkey. Avoids accessibility permissions and native modules. True global Option+Space deferred to a future Swift helper.
- 2026-05-22 — Streaming TTS uses a **parallel-TTS, FIFO-playback** pipeline: as soon as a chunk is ready, a TTS request fires; audio plays strictly in submit order. Reduces first-spoken-token latency without breaking ordering. OpenCode events sometimes emit cumulative text — the stream layer dedupes by tracking the last-seen prefix.
