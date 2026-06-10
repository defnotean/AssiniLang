# Configuration reference

This is the single source of truth for AssiniLang environment variables. All variables are read server-side or by the dev launcher; the browser never receives raw configuration or API keys, only the sanitized readiness report from `GET /llm/status`.

## Setting variables

PowerShell (Windows, the primary environment):

```powershell
$env:ASSINI_LLM_PROVIDER="ollama"
$env:ASSINI_LLM_BASE_URL="http://127.0.0.1:11434/v1"
$env:ASSINI_LLM_MODEL="llama3.1"
npm.cmd run dev
```

bash (macOS/Linux):

```bash
ASSINI_LLM_PROVIDER=ollama ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1 ASSINI_LLM_MODEL=llama3.1 npm run dev
```

Variables apply to the process you start; there is no `.env` file loader.

## LLM provider

Read by `apps/api/src/llmProvider.ts`. The same provider drives ingestion extraction and AI sessions.

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_LLM_PROVIDER` | unset (auto-detect) | `deterministic`, `off`, `mock`, `openai-compatible`, `local`, `ollama`, `lm-studio`, `openai`, `remote` | Selects the provider mode. `deterministic`/`off`/`mock` disable model calls. `openai-compatible`/`local`/`ollama`/`lm-studio` all mean "OpenAI-compatible endpoint at `ASSINI_LLM_BASE_URL`". `openai`/`remote` mean a remote API that requires a key. Any other value is an error. |
| `ASSINI_LLM_BASE_URL` | `https://api.openai.com/v1` in remote mode; required in local mode | http(s) URL | Base URL of the OpenAI-compatible `/chat/completions` endpoint. |
| `ASSINI_LLM_MODEL` | `gpt-4o-mini` in remote mode; required in local mode | model name string | Model sent in completion requests. Falls back to `OPENAI_MODEL` when unset. |
| `ASSINI_LLM_API_KEY` | unset | secret string | Bearer token for the LLM endpoint. Required in remote mode. `OPENAI_API_KEY` is accepted as an alias. |
| `ASSINI_LLM_TIMEOUT_MS` | `30000` | positive integer | Per-request completion timeout in milliseconds. Invalid values fall back to the default with a warning. |

Auto-detect when `ASSINI_LLM_PROVIDER` is unset: base URL plus model means local OpenAI-compatible mode; an API key alone means remote OpenAI mode; nothing configured means the deterministic fallback (no model calls, offline heuristics for ingestion).

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | unset | secret string | Alias for `ASSINI_LLM_API_KEY`. |
| `OPENAI_MODEL` | unset | model name string | Alias for `ASSINI_LLM_MODEL`. |

## Transcription (audio sources)

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_TRANSCRIBE_BASE_URL` | unset | http(s) URL | OpenAI-compatible server whose `/audio/transcriptions` endpoint transcribes uploaded audio sources. Audio processing fails with a clear error until this is set. |
| `ASSINI_TRANSCRIBE_MODEL` | `whisper-1` | model name string | Model sent with the transcription request. |
| `ASSINI_TRANSCRIBE_API_KEY` | unset | secret string | Optional bearer token for the transcription server. |

## Ingestion safety and OCR

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_ALLOW_PRIVATE_URLS` | unset (guard active) | `1` or `true` | Disables the SSRF guard so URL sources may point at localhost and private networks. Only enable in a trusted local setup; see [ingestion](ingestion.md#ssrf-guard). |
| `ASSINI_OCR_LANG` | `eng` | tesseract.js language code (`eng`, `spa`, `fra`, ...) | Language for the local OCR fallback on image sources. The first run per language downloads trained data (a few MB, internet required once) and caches it under `data/ocr-cache/`. |

## Ports, paths, and auth

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_DEV_API_PORT` | `4321` | port number | API port used by `npm.cmd run dev` (the launcher passes it to the API as `PORT` and to the web proxy as `ASSINI_API_PORT`). |
| `ASSINI_DEV_WEB_PORT` | `5173` | port number | Vite dev-server port used by `npm.cmd run dev`. |
| `PORT` | `4321` | port number | API listen port when running the API workspace directly. |
| `HOST` | `127.0.0.1` | hostname/IP | API listen host; also the host the dev launcher binds both processes to. |
| `ASSINI_API_HOST` | `127.0.0.1` | hostname/IP | Where the Vite `/api` proxy forwards requests (set automatically by the dev launcher). |
| `ASSINI_API_PORT` | `4321` | port number | Port for the Vite `/api` proxy target (set automatically by the dev launcher). |
| `ASSINI_DB_PATH` | `data/local-db.json` in the repo | absolute or relative file path | Overrides where the JSON local database lives. Uploaded assets and the OCR cache live next to it. |
| `ASSINI_DEV_AUTH_TOKEN` | unset (`test` under `NODE_ENV=test`) | secret string | Server token accepted in the `x-assini-dev-token` header for lead/admin server-token calls. |
| `ASSINI_ENABLE_PROTOTYPE_AUTH` | unset (disabled) | `true` | Enables `POST /auth/prototype-session` for browser prototype sessions. The dev launcher sets this automatically. |

## Setup recipes

### Ollama

```powershell
$env:ASSINI_LLM_PROVIDER="ollama"
$env:ASSINI_LLM_BASE_URL="http://127.0.0.1:11434/v1"
$env:ASSINI_LLM_MODEL="llama3.1"
npm.cmd run dev
```

For image sources, pick a vision-capable model such as `llava`.

### LM Studio

```powershell
$env:ASSINI_LLM_PROVIDER="lm-studio"
$env:ASSINI_LLM_BASE_URL="http://127.0.0.1:1234/v1"
$env:ASSINI_LLM_MODEL="<model name shown in LM Studio>"
npm.cmd run dev
```

### Generic OpenAI-compatible server

```powershell
$env:ASSINI_LLM_PROVIDER="openai-compatible"
$env:ASSINI_LLM_BASE_URL="http://127.0.0.1:8080/v1"
$env:ASSINI_LLM_MODEL="<served model name>"
# Optional, if the server requires a key:
$env:ASSINI_LLM_API_KEY="<key>"
npm.cmd run dev
```

### Remote OpenAI-compatible API

```powershell
$env:ASSINI_LLM_PROVIDER="openai"
$env:ASSINI_LLM_MODEL="gpt-4o-mini"
$env:ASSINI_LLM_API_KEY="<server-side key>"
npm.cmd run dev
```

Keys stay server-side. The browser only sees whether a key is configured.

### Local whisper server (audio transcription)

```powershell
$env:ASSINI_TRANSCRIBE_BASE_URL="http://127.0.0.1:9000/v1"
$env:ASSINI_TRANSCRIBE_MODEL="whisper-1"
npm.cmd run dev
```

Any server exposing an OpenAI-compatible `POST /audio/transcriptions` works (for example faster-whisper-server or whisper.cpp's server).

### Deterministic / no-model mode

```powershell
$env:ASSINI_LLM_PROVIDER="deterministic"
npm.cmd run dev
```

This is also the default with nothing configured. No external calls are made: text and word-list sources are parsed by the offline heuristic (delimited lines), images fall back to local OCR, and audio sources fail until a transcription endpoint is configured. Extraction results carry an explicit warning so you know no model ran.

## Checking the active configuration

```powershell
curl.exe http://localhost:4321/llm/status
```

The response reports provider mode, sanitized base URL, model, timeout, transcription readiness, and configuration warnings - never key values.
