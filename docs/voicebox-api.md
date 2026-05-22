# Voicebox Local API (v0.5.0)

Base URL: `http://127.0.0.1:17493`
OpenAPI: `GET /openapi.json` · Docs UI: `GET /docs`

This file captures only the endpoints we use. See `/docs` for the full surface.

---

## Health

```
GET /health
→ { status, model_loaded, model_downloaded, gpu_available, gpu_type, backend_type, ... }
```

## Voice profiles

```
GET /profiles
→ [ { id, name, language, default_engine, preset_voice_id, ... } ]
```

A profile **must** exist before `/speak` will work. The desktop app ships with a default preset (e.g. `"Heart"` using `kokoro`).

---

## Speech-to-Text — `POST /transcribe`

**Request:** `multipart/form-data`
- `file` (required) — audio file (WAV recommended, 16kHz mono)
- `language` (optional) — ISO code (`en`, `fr`, ...)
- `model` (optional)

**Response 200:**
```json
{ "text": "create a react dashboard", "duration": 1.83 }
```

---

## Text-to-Speech — async, three-step

### Step 1 — kick off generation

```
POST /speak
Content-Type: application/json

{ "text": "hello world", "profile": "Heart" }
```

Optional fields: `engine`, `language`, `personality`.

**Response 200** (GenerationResponse, `status: "generating"`):
```json
{
  "id": "7edb82d0-...",
  "profile_id": "...",
  "text": "hello world",
  "language": "en",
  "engine": "kokoro",
  "status": "generating",
  "audio_path": "",
  ...
}
```

### Step 2 — wait for completion

Two options:

**(a) Server-Sent Events** — `GET /generate/{id}/status`
Returns one or more SSE frames:
```
data: {"id": "...", "status": "completed", "duration": 2.0, "error": null}
```

**(b) Poll history** — `GET /history/{id}`
Returns a JSON record. When `status == "completed"`, the audio is ready.

Polling `/history/{id}` is simpler from Node; SSE is cleaner for low latency.

### Step 3 — fetch audio

```
GET /audio/{id}
→ audio/x-wav  (PCM 16-bit mono, 24 kHz from kokoro)
```

---

## Other useful endpoints (not used yet)

- `POST /generate` — full TTS request with profile_id, engine, model_size, effects_chain
- `POST /generate/{id}/cancel` — cancel in-flight generation (useful for interruption)
- `GET /events/speak` — SSE feed of all speak events
- `POST /llm/generate` — local LLM passthrough (could replace cleanup layer)
- `POST /captures` — voice capture pipeline with transcription baked in

---

## Gotchas

- `POST /speak` without a `profile` returns 422 ("No voice profile resolved"). Always pass a profile name or id, or configure a default in the desktop app's MCP settings.
- `audio_path` in the initial `/speak` response is empty — don't try to use it; fetch from `/audio/{id}` after status is `completed`.
- `/generate/{id}/status` returns **SSE**, not plain JSON. Set `Accept: text/event-stream` or parse `data: ...` lines yourself.
- `/health` reports `model_loaded: false` until the first request loads the model — first `/speak` after start is slower.
