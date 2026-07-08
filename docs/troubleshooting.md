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
| Settings shows warnings like `Local/OpenAI-compatible mode requires ASSINI_LLM_BASE_URL.` | `ASSINI_LLM_PROVIDER` is set but its required companions are missing | The server does not crash on invalid or incomplete LLM config; it boots in deterministic mode and `GET /llm/status` (the Settings model panel) reports the problem (mode `invalid` or incomplete with a warning). Set the missing values in Settings (saved hot to `.env`) or export them on the API process. Only dev-launcher settings such as ports and CORS require restarting `npm.cmd run dev`. |
| Model Setup says configured but ingestion or chat is still offline | The provider config shape is valid but the endpoint is unreachable (server down, wrong port, blocked) | Use Test connection (`POST /llm/health-check`) to check reachability; `/llm/status` only checks config shape, not reachability. |
| Results carry `Model output was not valid extraction JSON; fell back to offline heuristics.` | The model replied with prose or malformed JSON | Retry; if it persists, use a larger or more instruction-following model. Small local models often fail the strict JSON contract. |
| Image processing fails with `Local OCR could not read the image: ...` | No OCR model, no vision LLM, and tesseract found nothing readable | Provide a clearer/cropped image, set `ASSINI_OCR_LANG` to match the script, or configure `ASSINI_OCR_BASE_URL` / a vision-capable main LLM. |
| Image processing fails with `The configured model ... may not be vision-capable.` | An image source was sent to a non-vision main LLM with no OCR model configured | Configure `ASSINI_OCR_BASE_URL` with a vision model (for example `llava`), or set a vision-capable `ASSINI_LLM_MODEL`, or leave both unset to rely on tesseract. |
| Image processing fails with `OCR model request failed with status N.` | `ASSINI_OCR_BASE_URL` is set but the endpoint is down, misconfigured, or the model is not loaded | Confirm the server is running, the model name matches (`ollama pull llava`), and test reachability outside AssiniLang. `/llm/status` only checks config shape, not network reachability. |
| First image processing in deterministic mode is slow or fails offline | The first tesseract run per `ASSINI_OCR_LANG` downloads trained data from the tesseract.js CDN | Run it once with internet access; the data is cached under `data/ocr-cache/` and later runs work offline. |
| Audio processing fails with `Audio sources need a transcription endpoint.` | `ASSINI_TRANSCRIBE_BASE_URL` is not set | Point it at an OpenAI-compatible `/audio/transcriptions` server - see the [whisper recipe](configuration.md#local-whisper-server-audio-transcription). |
| `LLM provider request timed out after ...ms` | The local model is slower than the configured timeout | Raise `ASSINI_LLM_TIMEOUT_MS`, use async processing for long sources, or pick a smaller model. |
| Local model is extremely slow even though a capable GPU is installed | Ollama fell back to CPU inference (common on AMD GPUs that ROCm does not cover) | Check `ollama ps` - if it reports `100% CPU`, restart the Ollama server with `OLLAMA_VULKAN=1` and confirm it reports `100% GPU`. |
| Assistant replies are labeled "deterministic fallback (no model)" | No LLM provider is configured or the provider call failed | Configure `ASSINI_LLM_*` (see the [configuration reference](configuration.md)) and use Model Setup's connection test; the chip means the reply is canned offline text, not a model answer. |

## Sources

| Symptom | Cause | Fix |
| --- | --- | --- |
| URL source fails with `... points at a private or local network ... and was blocked.` | The SSRF guard blocks localhost and private ranges by default | Use a public URL, or set `ASSINI_ALLOW_PRIVATE_URLS=1` only in a trusted local setup. |
| Obsidian vault import returns `400` mentioning `ASSINI_OBSIDIAN_VAULT_ROOTS` | Vault import is fail-closed until allowlisted roots are configured, or the path sits outside those roots | Set `ASSINI_OBSIDIAN_VAULT_ROOTS` to semicolon-separated absolute directories that contain your vaults, then retry with a path under one of those roots. |
| PDF/DOCX fails with `The PDF contains no extractable text — it may be a scanned image; OCR is not supported yet.` (or the parallel `The document contains no extractable text — ...` for DOCX) | The file has no text layer; OCR applies only to image sources and is not supported for documents yet | Export pages as images and upload those (the image OCR fallback applies), or OCR the document externally and upload the text. |
| A source shows `Processing interrupted by a server restart. Re-run processing.` | The API crashed or restarted mid-processing; the startup recovery sweep reset the asset from `processing` to `failed` and logged a `source_asset.processing_recovered` audit event | Re-run processing on the source. |
| A source is stuck at `processing` while the API is still running | Async processing was claimed but the background task never persisted a result; recovery only runs at startup | Restart the API (the startup sweep resets it to `failed`), then reprocess. With seedable data, `npm.cmd run seed` resets the whole workspace. |
| Processing returns `409 Source is already processing` | An async run is still in flight, or a crash left the asset stuck | Wait for polling to finish (the console polls every 2.5 s); if it never finishes, apply the stuck-`processing` fix above. |

## Data and persistence

| Symptom | Cause | Fix |
| --- | --- | --- |
| API fails on startup or read with a loud validation error naming `data/local-db.json` | The local database is corrupted or was hand-edited into an invalid state; integrity validation fails on purpose rather than serving malformed records | Read the error - it names the offending collection and field. Fix the JSON by hand, restore a backup, or reseed an empty workspace with `npm.cmd run seed` (this discards workspace data). |
| Old local database from an earlier milestone will not load | Versions v1-v7 migrate forward automatically; anything older or hand-mangled does not | Reseed with `npm.cmd run seed`. |
| Mutations suddenly return `429` | Per-actor rate limit (120 mutating requests/minute per route) | Wait for the `Retry-After` interval; bulk operations should pace themselves. |
