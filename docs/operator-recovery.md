# Operator recovery runbook

Short procedures for local operators running AssiniLang as a research console or local beta. For symptom tables and model-specific fixes, see [Troubleshooting](troubleshooting.md). For backup API details, see [Maintenance Guide — backing up and restoring](maintenance.md#backing-up-and-restoring-the-local-database).

## Local data paths

AssiniLang keeps all workspace data under the configured data directory (repo checkout default: `data/` at the project root). Override the database location with `ASSINI_DB_PATH`; sibling folders are resolved next to that path.

| Path | Purpose |
| --- | --- |
| `data/local-db.json` | Default JSON workspace (languages, sources, drafts, audit events, users). A path that does not end in `.json` selects the SQLite backend instead. |
| `data/backups/` | Timestamped backups from `npm.cmd run db:backup` (CLI) or the desktop app's backup tools. |
| `data/assets/<languageId>/` | Uploaded source files (images, audio, PDF, DOCX) referenced by `sourceAssets.filePath`. |
| `data/ocr-cache/` | Cached tesseract.js trained data for the local OCR image fallback (`ASSINI_OCR_LANG`); scanned PDFs use the configured vision OCR model (`ASSINI_OCR_BASE_URL`) on page 1 only. |
| `data/ingestion-uploads/` | Temporary multipart upload staging (ignored by Git). |

**Desktop packaged app:** Settings → Desktop app tools shows the install folder, local data directory, backups folder, and latest backup path. Backups and data live under the per-user app data root (for example `%APPDATA%\AssiniLang\`), not necessarily the repo `data/` tree.

## Backup and restore

### CLI (repo / dev launcher)

```powershell
npm.cmd run db:backup
npm.cmd run db:backup -- path\to\my-backup.json
```

Writes a validated copy to `data/backups/local-db-<timestamp>.json` (or the path you pass). Restore is deliberate: use `JsonStore.restoreFrom(sourcePath)` from a Node REPL or small script so a bad backup cannot silently replace live data. Restore validates against the current schema before replacing the live database.

### Desktop app

In Settings → Desktop app tools:

- **Create backup** — timestamped copy before experiments.
- **Restore latest backup** — confirms, then replaces live data from the newest backup (a safety backup is created first when possible).
- **Open backups folder** / **Prune old backups** — keeps the newest five routine backups; safety restore backups are left alone.

Run a backup before bulk imports, model experiments, or manual JSON edits.

## Interrupted processing recovery

Background extraction marks a source `processing`, runs in the API process, and the web console polls every 2.5 seconds until the source leaves `processing` (max 10 minutes in the UI; then the console shows a timeout and stops polling).

If the API **crashes or restarts** while a source is `processing`:

1. On startup, `apps/api/src/jobRecovery.ts` sweeps every asset still in `processing`.
2. Each recovered asset moves to `failed` with the operator-visible error: `Processing interrupted by a server restart. Re-run processing.`
3. An audit event `source_asset.processing_recovered` is appended per asset.
4. In Build, re-run **Process** on the source.

If a source stays **`processing` while the API is still running** (background task never persisted a result):

1. Restart the API so the startup sweep runs, **or** wait for the web console's 10-minute poll timeout, then restart if the server is stuck.
2. Re-run processing on the source once it shows `failed`.

See [Ingestion Deep Dive — sync vs async processing](ingestion.md#sync-vs-async-processing) for the full flow.

## Corrupted database — loud failure and reseed

AssiniLang **fails loudly** on read when `data/local-db.json` (or the SQLite file) does not validate against `appStateSchema`. Startup or the first mutation returns an error that names the database path and usually the offending collection or field.

**Do not** hand-edit the database unless you know the schema. Prefer, in order:

1. **Restore a backup** (CLI or desktop restore).
2. **Fix the specific invalid record** if the error message points to one field.
3. **Reseed an empty workspace** when data loss is acceptable:

```powershell
npm.cmd run seed
```

Reseed writes an empty workspace (prototype users, no languages) and **discards** existing workspace content. Legacy schema versions v1–v7 migrate forward automatically on read; reseed is for corruption or a clean slate, not normal upgrades.

## Logs and diagnostics

| Source | What to collect |
| --- | --- |
| API terminal | Fastify request logs, validation errors, LLM/OCR/transcription failures, recovery sweep counts at startup. |
| Web dev server | Vite proxy errors if the UI cannot reach the API. |
| `GET /health`, `GET /ready` | Liveness and readiness (recovery runs on ready). |
| Settings → Model Setup | Provider mode, readiness warnings, **Test connection** (`POST /llm/health-check`) for reachability (not just config shape). |
| Settings → Desktop app tools → **Copy diagnostics** / **Save diagnostics** | Redacted bundle: paths, backup summary, model discovery, observability counts — no API keys or answer keys. |
| Audit events (Review / export) | `source_asset.process_started`, `source_asset.processing_recovered`, draft accept/reject, language mutations. |

When filing an issue, include the sanitized diagnostics text, the source kind and title, and whether processing was sync or async.

## Reset steps

Use the shallowest reset that fixes the problem:

1. **Single stuck source:** restart API → confirm `failed` + recovery message → re-process.
2. **Bad import or experiment:** restore latest backup (desktop) or `restoreFrom` (CLI).
3. **Broken model config:** fix Settings / `.env`, test connection; no data reset needed.
4. **Corrupt or unrecoverable DB:** restore backup; if none, `npm.cmd run seed` for empty workspace.
5. **Full local wipe (dev checkout):** stop API and web, delete or rename `data/local-db.json`, optional `data/assets/`, `data/ocr-cache/`, `data/backups/` as needed, then `npm.cmd run seed` and restart `npm.cmd run dev`.

After any restore or reseed, verify `/ready`, open Build, and confirm languages and sources match expectations before continuing review work.
