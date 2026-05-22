# OpenCode + Voicebox Voice Mode Setup Plan

## Goal

Build a low-latency local voice mode for OpenCode using Voicebox.

Features:
- Push-to-talk voice input
- Speech-to-text → OpenCode
- Stream OpenCode responses
- Text-to-speech assistant replies
- Interruptible voice playback
- Local-first architecture
- Minimal latency

---

# High-Level Architecture

```txt
┌─────────────────────┐
│     User Voice      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Mic Recorder      │
│  (Push-to-talk)     │
└──────────┬──────────┘
           │ audio
           ▼
┌─────────────────────┐
│      Voicebox       │
│    /transcribe      │
└──────────┬──────────┘
           │ text
           ▼
┌─────────────────────┐
│      OpenCode       │
│   Agent Request     │
└──────────┬──────────┘
           │ streamed tokens
           ▼
┌─────────────────────┐
│  Response Formatter │
│ - chunking          │
│ - markdown cleanup  │
│ - skip code blocks  │
└──────────┬──────────┘
           │ sentences
           ▼
┌─────────────────────┐
│      Voicebox       │
│       /speak        │
└──────────┬──────────┘
           │ audio
           ▼
┌─────────────────────┐
│      Speaker        │
└─────────────────────┘
```

---

# Recommended Stack

## Core

- Node.js + TypeScript
- OpenCode plugin
- Voicebox local server

## Optional

- Electron/Tauri shell
- Swift helper for native macOS hotkeys
- WebSocket streaming bridge

---

# Recommended Folder Structure

```txt
voice-mode/
├── src/
│   ├── audio/
│   │   ├── recorder.ts
│   │   ├── playback.ts
│   │   └── vad.ts
│   │
│   ├── voicebox/
│   │   ├── tts.ts
│   │   ├── stt.ts
│   │   └── client.ts
│   │
│   ├── opencode/
│   │   ├── stream.ts
│   │   ├── prompts.ts
│   │   └── events.ts
│   │
│   ├── formatter/
│   │   ├── markdown.ts
│   │   ├── chunker.ts
│   │   └── summarizer.ts
│   │
│   ├── queue/
│   │   └── speechQueue.ts
│   │
│   ├── hotkeys/
│   │   └── pushToTalk.ts
│   │
│   └── index.ts
│
├── package.json
├── tsconfig.json
└── .env
```

---

# Step 1 — Install Voicebox

## Clone

```bash
git clone https://github.com/jamiepine/voicebox.git
cd voicebox
```

## Install

Follow Voicebox install guide.

For Apple Silicon:
- Prefer lightweight models initially
- Use Whisper Turbo
- Use Kokoro TTS

---

# Step 2 — Start Voicebox

Example:

```bash
voicebox serve
```

Expected local endpoint:

```txt
http://127.0.0.1:17493
```

---

# Step 3 — Verify APIs

## STT

```bash
POST /transcribe
```

Input:
- WAV audio

Output:

```json
{
  "text": "create a react dashboard"
}
```

---

## TTS

```bash
POST /speak
```

Input:

```json
{
  "text": "I created the component."
}
```

---

# Step 4 — Create OpenCode Plugin

## Responsibilities

The plugin should:
- listen to microphone
- send STT request
- inject prompt into OpenCode
- listen to streamed response
- chunk response
- send TTS requests

---

# Step 5 — Implement Push-to-Talk

## Recommended UX

```txt
Hold Option+Space
→ recording starts

Release
→ transcription starts
→ send to OpenCode
```

---

# Step 6 — Audio Recording

## Recommended Format

```txt
16kHz mono WAV
```

This works well with Whisper.

---

# Step 7 — Transcription Flow

```txt
Mic Audio
→ save temp WAV
→ POST /transcribe
→ receive text
→ send to OpenCode
```

---

# Step 8 — Stream OpenCode Responses

## Important

Do NOT wait for full completion.

Use:
- stdout stream
- websocket stream
- SSE stream

depending on OpenCode internals.

---

# Step 9 — Response Chunking

## Goal

Convert streamed tokens into natural speech chunks.

---

## Bad

```txt
"Sure comma I can help you create..."
```

---

## Good

```txt
"Sure. I can help you create that."
```

---

# Recommended Chunk Rules

Speak when:
- sentence ends
- newline appears
- pause threshold reached
- code block starts

---

# Step 10 — Skip Reading Code

## Important

Never speak raw code blocks.

Instead:

```txt
"I updated the React component and added Tailwind styles."
```

---

# Suggested Rules

## Skip

- markdown tables
- stack traces
- code fences
- terminal logs

## Read

- summaries
- explanations
- status updates

---

# Step 11 — Build Speech Queue

## Why

Without a queue:
- speech overlaps
- interruptions fail
- playback becomes chaotic

---

# Queue Responsibilities

- FIFO playback
- cancel current speech
- debounce tiny chunks
- interrupt on user speech

---

# Recommended Behavior

## User starts speaking

Immediately:
- stop TTS
- clear queue
- start recording

This is critical for natural UX.

---

# Step 12 — Voice Formatting Layer

Before TTS:

```txt
Markdown
→ cleaned text
→ natural speech
```

---

# Example Transformations

## Markdown

```md
## Installation
Run npm install
```

## Spoken

```txt
"Installation. Run npm install."
```

---

# Step 13 — Add Streaming TTS

## Basic

Wait for sentence completion.

---

## Better

Progressive speech:
- stream chunks
- begin playback immediately

This dramatically improves responsiveness.

---

# Step 14 — Optional AI Cleanup Layer

Optional improvement:

```txt
Raw STT
→ cleanup LLM
→ OpenCode
```

---

# Example

## Raw

```txt
"uh create like a react dashboard thing"
```

## Cleaned

```txt
Create a React dashboard component.
```

---

# Step 15 — Add Voice Personalities

Optional:

```txt
Code Review Voice
Debug Voice
Assistant Voice
```

Different TTS profiles.

---

# Recommended MVP Timeline

## Phase 1 — Basic Input

- Push-to-talk
- STT
- Send prompt

---

## Phase 2 — Basic Output

- Read assistant responses

---

## Phase 3 — Streaming

- token streaming
- sentence chunking
- queue system

---

## Phase 4 — Natural UX

- interruptions
- VAD
- smarter chunking

---

## Phase 5 — Advanced

- wake words
- AI cleanup
- multi-agent voices
- conversation mode

---

# Recommended Tech Choices

## Audio

### Recording

- `node-record-lpcm16`
- `mic`
- `naudiodon`

### Playback

- `speaker`
- `play-sound`

---

## Streaming

- WebSocket
- EventEmitter
- RxJS optional

---

## Hotkeys

- `iohook`
- Swift helper app

---

# Latency Targets

## Good Experience

| Action | Target |
|---|---|
| STT | < 700ms |
| First spoken token | < 1.5s |
| Interrupt response | < 200ms |

---

# Biggest Engineering Challenges

## 1. Interruption

Must instantly stop speaking.

---

## 2. Chunking

Prevent robotic speech.

---

## 3. Audio Queueing

Avoid overlapping playback.

---

## 4. Streaming

Speak while generating.

---

# Recommended Future Architecture

```txt
OpenCode
   ↓
Voice Orchestrator
   ├── STT
   ├── Formatter
   ├── Speech Queue
   ├── Interrupt Manager
   └── TTS
```

This keeps the system maintainable as features grow.

---

# Final Recommendation

Start with the absolute smallest working loop:

```txt
Push-to-talk
→ STT
→ OpenCode
→ speak response
```

Do not overbuild first.

The “magic feeling” comes mostly from:
- low latency
- interruption
- streaming speech

not from complex AI features.
