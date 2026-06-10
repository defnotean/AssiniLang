# Troubleshooting

Symptom-cause-fix tables for the problems you are most likely to hit locally. Configuration details live in the [configuration reference](configuration.md); ingestion behavior and the full error catalogue live in the [ingestion deep dive](ingestion.md).

## Startup and ports

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm.cmd run dev` fails with `EADDRINUSE` or the web app cannot reach the API | Ports `4321` (API) or `5173` (web) are already in use | Set `$env:ASSINI_DEV_API_PORT="44321"` and `$env:ASSINI_DEV_WEB_PORT="55173"`, then rerun `npm.cmd run dev`. The launcher rewires the Vite proxy automatically. |
| Browser shows the app but every action returns `Prototype auth is disabled` | The API was started directly without `ASSINI_ENABLE_PROTOTYPE_AUTH=true` | Start through `npm.cmd run dev` (which sets it), or set the variable yourself. |

## Models and extraction

| Symptom | Cause | Fix |
| --- | --- | --- |
| Extraction results carry `No model configured (deterministic mode); used offline heuristic parsing.` | No LLM provider is configured, so only delimited lines (`form = gloss`) are parsed, at low confidence | Configure Ollama, LM Studio, or another OpenAI-compatible endpoint - see the [setup recipes](configuration.md#setup-recipes). Deterministic mode is fine for word lists. |
| Model Setup view shows warnings like `Local/OpenAI-compatible mode requires ASSINI_LLM_BASE_URL.` | `ASSINI_LLM_PROVIDER` is set but its required companions are missing | The server does not crash on invalid or incomplete LLM config; it boots in deterministic mode and `GET /llm/status` (the Model Setup panel) reports the problem (mode `invalid` or `incomplete` with a warning). Set `ASSINI_LLM_BASE_URL` and `ASSINI_LLM_MODEL` (local modes) or an API key (remote mode) on the API process and restart. |
| Model Setup says configured but ingestion or chat is still offline | The provider config shape is valid but the endpoint is unreachable (server down, wrong port, blocked) | Use Test connection (`POST /llm/health-check`) to check reachability; `/llm/status` only checks config shape, not reachability. |
| Results carry `Model output was not valid extraction JSON; fell back to offline heuristics.` | The model replied with prose or malformed JSON | Retry; if it persists, use a larger or more instruction-following model. Small local models often fail the strict JSON contract. |
| Image processing fails with `Local OCR could not read the image: ...` | No vision model is configured and OCR found nothing readable | Provide a clearer/cropped image, set `ASSINI_OCR_LANG` to match the script, or configure a vision-capable model (for example `llava` via Ollama) so the image bypasses OCR entirely. |
| Image processing fails with `The configured model ... may not be vision-capable.` | An image source was sent to a configured but non-vision model | Configure a vision model (for example `llava`) in `ASSINI_LLM_MODEL`, or leave the model unset to rely on the local OCR fallback. |
| First image processing in deterministic mode is slow or fails offline | The first OCR run per `ASSINI_OCR_LANG` downloads trained data from the tesseract.js CDN | Run it once with internet access; the data is cached under `data/ocr-cache/` and later runs work offline. |
| Audio processing fails with `Audio sources need a transcription endpoint.` | `ASSINI_TRANSCRIBE_BASE_URL` is not set | Point it at an OpenAI-compatible `/audio/transcriptions` server - see the [whisper recipe](configuration.md#local-whisper-server-audio-transcription). |
| `LLM provider request timed out after 30000ms` | The local model is slower than the timeout | Raise `ASSINI_LLM_TIMEOUT_MS`, use async processing for long sources, or pick a smaller model. |

## Sources

| Symptom | Cause | Fix |
| --- | --- | --- |
| URL source fails with `... points at a private or local network ... and was blocked.` | The SSRF guard blocks localhost and private ranges by default | Use a public URL, or set `ASSINI_ALLOW_PRIVATE_URLS=1` only in a trusted local setup. |
| PDF/DOCX fails with `The PDF contains no extractable text — it may be a scanned image; OCR is not supported yet.` (or the parallel `The document contains no extractable text — ...` for DOCX) | The file has no text layer; OCR applies only to image sources and is not supported for documents yet | Export pages as images and upload those (the image OCR fallback applies), or OCR the document externally and upload the text. |
| A source is stuck at `processing` after the API crashed or was restarted | Async processing was claimed but the background task never persisted a result; there is no in-process resume | Edit `data/local-db.json` and set that asset's `status` to `failed` (or `pending`), then reprocess. With seedable data, `npm.cmd run seed` resets the whole workspace. |
| Processing returns `409 Source is already processing` | An async run is still in flight, or a crash left the asset stuck | Wait for polling to finish (the console polls every 2.5 s); if it never finishes, apply the stuck-`processing` fix above. |

## Data and persistence

| Symptom | Cause | Fix |
| --- | --- | --- |
| API fails on startup or read with a loud validation error naming `data/local-db.json` | The local database is corrupted or was hand-edited into an invalid state; integrity validation fails on purpose rather than serving malformed records | Read the error - it names the offending collection and field. Fix the JSON by hand, restore a backup, or reseed an empty workspace with `npm.cmd run seed` (this discards workspace data). |
| Old local database from an earlier milestone will not load | Versions v1-v7 migrate forward automatically; anything older or hand-mangled does not | Reseed with `npm.cmd run seed`. |
| Mutations suddenly return `429` | Per-actor rate limit (120 mutating requests/minute per route) | Wait for the `Retry-After` interval; bulk operations should pace themselves. |
