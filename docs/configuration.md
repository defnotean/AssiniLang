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

Variables apply to the process you start. You can also keep `ASSINI_*` settings in a repo-root `.env` file instead of re-exporting them every shell: the API loads env files at startup with documented precedence (shell env wins, then repo-root `.env`, then cwd `.env`). Start from `.env.example` for safe local defaults, then keep real secrets in `.env` only. The repo-root `.env` is git-ignored locally so secrets are never committed.

The web app's Model Setup screen can edit the common runtime settings through `GET /llm/settings` and `PUT /llm/settings`. It also calls `GET /llm/models` to populate the model dropdown from the configured endpoint, common local providers, and optional discovery URLs. If no model is configured and exactly one no-key local model is discovered, the app saves and activates it automatically. Choosing a discovered model also saves and switches the active provider immediately; manually typed settings still use Save settings. Saving writes the repo-root `.env`, updates the running API process environment, and refreshes the active model provider for future ingestion, model-draft generation, and AI sessions. API keys are write-only: the browser can submit replacements or clear them, but settings/status responses only report whether a key is configured. Dev launcher settings such as ports, host, allowed origins, body limit, logger, database path, and prototype auth still require restarting `npm.cmd run dev`.

## LLM provider

Read by `apps/api/src/llmProvider.ts`. The same provider drives ingestion extraction and AI sessions.

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_LLM_PROVIDER` | unset (auto-detect) | `deterministic`, `off`, `mock`, `openai-compatible`, `local`, `ollama`, `lm-studio`, `openai`, `remote` | Selects the provider mode. `deterministic`/`off`/`mock` disable model calls. `openai-compatible`/`local`/`ollama`/`lm-studio` all mean "OpenAI-compatible endpoint at `ASSINI_LLM_BASE_URL`". `openai`/`remote` mean a remote API that requires a key. Any other value is unknown: the server degrades to deterministic mode (no external calls), and `GET /llm/status` reports mode `invalid` with a warning rather than HTTP-erroring itself. |
| `ASSINI_LLM_BASE_URL` | `https://api.openai.com/v1` in remote mode; required in local mode | http(s) URL | Base URL of the OpenAI-compatible `/chat/completions` endpoint. |
| `ASSINI_LLM_MODEL` | `gpt-4o-mini` in remote mode; required in local mode | model name string | Model sent in completion requests. Falls back to `OPENAI_MODEL` when unset. |
| `ASSINI_LLM_API_KEY` | unset | secret string | Bearer token for the LLM endpoint. Required in remote mode. `OPENAI_API_KEY` is accepted as an alias. |
| `ASSINI_LLM_TIMEOUT_MS` | `180000` | positive integer | Per-request completion timeout in milliseconds. Invalid values fall back to the default with a warning. |
| `ASSINI_LLM_MAX_TOKENS` | `4096` | positive integer | Caps `max_tokens` on each model request. Unset or invalid values fall back to the default. Raise it if extractions are getting truncated. |
| `ASSINI_LLM_JSON_MODE` | unset (off) | `1` or `true` | When enabled, sends `response_format: { type: "json_object" }` on extraction (`completeChat`) requests only - never on AI chat sessions. Off by default because some local servers reject the field; turn it on with capable servers (recent llama.cpp or OpenAI) to make extraction JSON more reliable. |
| `ASSINI_LLM_ACTIVE_PROFILE_ID` | unset | profile id string | Runtime settings screen bookkeeping for the active saved model profile. Usually written by the app, not by hand. |
| `ASSINI_LLM_MODEL_PROFILES` | unset | JSON array | Runtime settings screen storage for saved model profiles. May contain server-side API keys; keep it in local `.env` only and edit through the app when possible. |
| `ASSINI_LLM_DISCOVERY_BASE_URLS` | unset | comma- or whitespace-separated http(s) URLs | Extra model endpoints for `GET /llm/models` to probe. Use this for model servers on another machine instead of relying on broad LAN scans. URLs may be roots (`http://box:11434`) or OpenAI-compatible bases (`http://box:8080/v1`). |
| `ASSINI_MODEL_DISCOVERY_URLS` | unset | comma- or whitespace-separated http(s) URLs | Alias for `ASSINI_LLM_DISCOVERY_BASE_URLS`. |

Auto-detect when `ASSINI_LLM_PROVIDER` is unset: base URL plus model means local OpenAI-compatible mode; an API key alone means remote OpenAI mode; nothing configured means the deterministic fallback (no model calls, offline heuristics for ingestion).

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | unset | secret string | Alias for `ASSINI_LLM_API_KEY`. |
| `OPENAI_MODEL` | unset | model name string | Alias for `ASSINI_LLM_MODEL`. |

## Verification scripts

Read by the local driver scripts under `scripts/`. These are optional test harness controls and do not affect the running browser app unless the script explicitly saves runtime settings through the API.

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_TEST_USER` | `reviewer-1` | user id string | Actor id used by `scripts/verifyDgxLanguage.mjs` when sending API requests. |
| `ASSINI_VERIFY_LANGUAGE` | `Veridspark` | language name string | Language name used by `npm run model:verify` when creating or expanding the local model verification workspace. |
| `ASSINI_VERIFY_MODEL` | unset (skip) | `1`/`true` to opt in, or a model name string | When set to `1` or `true`, `npm run verify:beta` runs `npm run model:verify`. When set to a model name, it is the preferred model for `npm run model:verify`; the script probes discovered models and falls back to another reachable model if this one is listed but cannot generate. |
| `ASSINI_VERIFY_MODEL_NAME` | `Irene` | model name string | Preferred model name used by `npm run model:verify` when `ASSINI_VERIFY_MODEL=1` enables the opt-in gate. |
| `ASSINI_VERIFY_MODEL_BASE_URL` | unset | http(s) URL | Optional preferred base URL for `ASSINI_VERIFY_MODEL`, useful when several exposed endpoints list similarly named models. |
| `ASSINI_VERIFY_AUTO_SWITCH_MODEL` | unset (enabled) | `false` to disable | Allows `npm run model:verify` to save the selected reachable model into runtime settings before running model-backed checks. |
| `ASSINI_VERIFY_MAX_TOKENS` | `8192` | positive integer | Max token cap saved by `npm run model:verify` when it auto-switches the model. Raise this for reasoning-heavy local models that need more room to emit final JSON. |
| `ASSINI_VERIFY_JSON_MODE` | unset (enabled) | `false` to disable | Controls whether `npm run model:verify` saves runtime JSON mode while configuring the selected model. |
| `ASSINI_DESKTOP_FORCE_BUILD` | unset | `1` | Forces `npm.cmd run desktop` to rebuild before opening the Electron desktop shell, even when existing build outputs look current. |
| `ASSINI_DESKTOP_SMOKE` | unset | `1` | Internal flag used by `npm.cmd run desktop:smoke` to make the packaged Electron app run its rendered UI smoke check and exit automatically. |
| `ASSINI_DESKTOP_SMOKE_REPORT` | `dist-desktop/desktop-smoke-report.json` from the launcher | file path | Internal report path used by the packaged desktop smoke check. |
| `ASSINI_DESKTOP_SMOKE_SCREENSHOT` | `dist-desktop/desktop-smoke.png` from the launcher | file path | Internal screenshot path used by the packaged desktop smoke check to prove the window is not blank. |

## Transcription (audio sources)

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_TRANSCRIBE_BASE_URL` | unset | http(s) URL | OpenAI-compatible server whose `/audio/transcriptions` endpoint transcribes uploaded audio sources. Audio processing fails with a clear error until this is set. |
| `ASSINI_TRANSCRIBE_MODEL` | `whisper-1` | model name string | Model sent with the transcription request. |
| `ASSINI_TRANSCRIBE_API_KEY` | unset | secret string | Optional bearer token for the transcription server. |

## OCR model (image sources)

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_OCR_BASE_URL` | unset | http(s) URL | OpenAI-compatible server whose `/chat/completions` endpoint reads image sources. When set, image processing tries this dedicated OCR model before the main LLM or local tesseract fallback. |
| `ASSINI_OCR_MODEL` | `llava` | model name string | Model sent with the OCR request. Can differ from `ASSINI_LLM_MODEL` so you can keep a small text model for extraction and a vision model only for images. |
| `ASSINI_OCR_API_KEY` | unset | secret string | Optional bearer token for the OCR server. |

## Ingestion safety and OCR

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_ALLOW_PRIVATE_URLS` | unset (guard active) | `1` or `true` | Disables the SSRF guard so URL sources may point at localhost and private networks. Only enable in a trusted local setup; see [ingestion](ingestion.md#ssrf-guard). |
| `ASSINI_OBSIDIAN_VAULT_ROOTS` | unset (vault import disabled) | semicolon-separated absolute directory paths | Allowlist of roots for `POST /languages/:languageId/sources/obsidian-vault`. The resolved vault path must equal a root or sit under `root` + path separator. Fail-closed: when unset or empty, vault imports return `400`. Relative segments (for example `./vaults`) are dropped so the process CWD cannot silently widen the allowlist; if every entry is relative, imports return `400` with an absolute-path message. Prefer `realpath` so symlink escapes cannot leave an allowlisted root. Example: `C:\Users\you\Documents\Obsidian;D:\LanguageVaults`. |
| `ASSINI_OCR_LANG` | `eng` | tesseract.js language code (`eng`, `spa`, `fra`, ...) | Language for the local tesseract.js fallback on image sources when neither the OCR model nor a vision-capable main LLM is configured. The first run per language downloads trained data (a few MB, internet required once) and caches it under `data/ocr-cache/`. |

## Ports, paths, and auth

| Variable | Default | Accepted values | Effect |
| --- | --- | --- | --- |
| `ASSINI_DEV_API_PORT` | `4321` | port number | API port used by `npm.cmd run dev` (the launcher passes it to the API as `PORT` and to the web proxy as `ASSINI_API_PORT`). |
| `ASSINI_DEV_WEB_PORT` | `5173` | port number | Vite dev-server port used by `npm.cmd run dev`. |
| `PORT` | `4321` | port number | API listen port when running the API workspace directly. |
| `HOST` | `127.0.0.1` | hostname/IP | API listen host; also the host the dev launcher binds both processes to. |
| `ASSINI_API_HOST` | `127.0.0.1` | hostname/IP | Where the Vite `/api` proxy forwards requests (set automatically by the dev launcher). |
| `ASSINI_API_PORT` | `4321` | port number | Port for the Vite `/api` proxy target (set automatically by the dev launcher). |
| `ASSINI_DB_PATH` | `data/local-db.json` in the repo | absolute or relative file path | Overrides where the local database lives. Paths ending in `.json` use the JSON store; any other extension uses SQLite. Uploaded assets and the OCR cache live next to it. Honored by seed, eval, and `db:backup`. |
| `ASSINI_SEED_FIXTURE` | unset | `1` / `true` | When set, `npm run seed` writes the built-in Testlang fixture instead of an empty workspace. Verify sets this automatically. |
| `ASSINI_EVAL_REQUIRE_LANGUAGES` | unset | `1` / `true` | When set, `npm run eval` exits non-zero if the workspace has no languages. Verify sets this automatically so an empty seed cannot green-pass. |
| `ASSINI_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | comma-separated origins | CORS allow-list for the API. Set this explicitly when serving the web app from a deployed origin. |
| `ASSINI_BODY_LIMIT_BYTES` | `65536` | positive integer | Maximum JSON request body size for Fastify routes. Multipart file uploads keep their separate 25 MB cap. |
| `ASSINI_API_LOGGER` | unset (off) | `1` or `true` | Enables Fastify's built-in request/error logger for deployed or diagnostic runs. |
| `ASSINI_DEV_AUTH_TOKEN` | unset (`test` under `NODE_ENV=test`; `.env.example` uses `dev-local`) | secret string | Server token accepted in the `x-assini-dev-token` header with `x-assini-user-id` for any prototype actor (reviewer, programmer, lead, admin, …). When unset, scripted server-token calls return `401`. Local driver scripts default the client token to `dev-local` — set the same value on the API (as in `.env.example`) or override both sides together. |
| `ASSINI_ENABLE_PROTOTYPE_AUTH` | unset (disabled) | `true` | Enables `POST /auth/prototype-session` for browser prototype sessions. The dev launcher sets this automatically. |
| `ASSINI_PROTOTYPE_SESSION_TTL_MS` | `28800000` (8 hours) | positive integer (milliseconds) | Prototype session lifetime. Each successful use within the TTL slides the server `expiresAt` forward and re-issues `Set-Cookie` with a matching `Max-Age` so browsers keep the cookie; expired sessions return 401 and are evicted lazily and during session creation. Empty or whitespace-only session cookie values (for example after sign-out `Max-Age=0`) are treated as absent. When the Cookie header lists the same session name more than once, the last matching pair wins; a trailing empty pair still clears a prior id, but a trailing malformed percent-encoded pair is skipped so it cannot wipe a prior valid session id. Repeated Cookie headers exposed as a string array are joined before parsing so session pairs are not dropped. Invalid values fail server startup. |
| `ASSINI_COOKIE_SECURE` | unset (`Secure` when `NODE_ENV=production`) | `1`/`true` or `0`/`false` | When true (or when unset in production), prototype session `Set-Cookie` includes the `Secure` attribute so the session id is not sent over cleartext HTTP. Set `0` only for local HTTP development. |
| `ASSINI_API_URL` | `http://127.0.0.1:4321` | URL | Base API URL used by driver scripts such as `scripts/setupKelevi.mjs` (the synthetic demo-language builder). |

## Setup recipes

### Ollama

```powershell
$env:ASSINI_LLM_PROVIDER="ollama"
$env:ASSINI_LLM_BASE_URL="http://127.0.0.1:11434/v1"
$env:ASSINI_LLM_MODEL="llama3.1"
npm.cmd run dev
```

The explicit `/v1` base URL above is still correct. With the `ollama` alias a bare host (for example `http://127.0.0.1:11434`) now also works: the base URL is auto-normalized to end in `/v1`.

For image sources, pick a vision-capable model such as `llava`, or configure a separate OCR endpoint (see [Ollama OCR model](#ollama-ocr-model-image-sources) below).

Two practical notes from real-model testing:

- On AMD GPUs that ROCm does not cover (verified on an RX 9070 XT), Ollama silently falls back to CPU at roughly a tenth of the speed. Start the Ollama server with `OLLAMA_VULKAN=1` to use the Vulkan backend and check placement with `ollama ps` (it should report `100% GPU`).
- Extraction prompts generate long structured output; for very large local models, raise the request timeout beyond the 180-second default if long sources still abort.

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
# Optional, on servers that accept it, to make extraction JSON more reliable:
$env:ASSINI_LLM_JSON_MODE="1"
# Optional, raise if extractions are getting truncated:
$env:ASSINI_LLM_MAX_TOKENS="8192"
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

### Ollama OCR model (image sources)

Use a dedicated vision endpoint for images while keeping a smaller text model for extraction:

```powershell
$env:ASSINI_LLM_PROVIDER="ollama"
$env:ASSINI_LLM_BASE_URL="http://127.0.0.1:11434/v1"
$env:ASSINI_LLM_MODEL="llama3.1"
$env:ASSINI_OCR_BASE_URL="http://127.0.0.1:11434/v1"
$env:ASSINI_OCR_MODEL="llava"
npm.cmd run dev
```

Pull the vision model first (`ollama pull llava`). Image sources call the OCR endpoint; text extraction still uses the main LLM. If `ASSINI_OCR_BASE_URL` is unset, images fall back to the main LLM when it is vision-capable, otherwise to local tesseract (`ASSINI_OCR_LANG`).

### Deterministic / no-model mode

```powershell
$env:ASSINI_LLM_PROVIDER="deterministic"
npm.cmd run dev
```

This is also the default with nothing configured. No external calls are made: text and word-list sources are parsed by the offline heuristic (delimited lines), images fall back to local tesseract OCR, and audio sources fail until a transcription endpoint is configured. Extraction results carry an explicit warning so you know no model ran.

## Checking the active configuration

```powershell
curl.exe http://localhost:4321/llm/status
```

The response reports provider mode, sanitized base URL, model, timeout, transcription readiness, OCR readiness, and configuration warnings - never key values.
