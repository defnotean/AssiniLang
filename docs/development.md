# Development Guide

This guide covers local setup, verification, browser checks, and model/transcription configuration.

## Requirements

- Node.js compatible with the repository lockfile.
- npm.
- PowerShell on Windows, or any shell that can run the equivalent npm commands.

## Install

```powershell
npm.cmd install
```

On macOS, Linux, or shells where the normal npm shim is available, use `npm` instead of `npm.cmd`.

## Local Quality Gate

Use the full verifier before committing meaningful changes:

```powershell
npm.cmd run verify
```

The verifier runs:

1. Vitest.
2. TypeScript project checks.
3. Empty-workspace seed.
4. Deterministic evaluation.
5. Workspace builds.

For narrower loops:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run seed
npm.cmd run eval
npm.cmd run build
```

## Start The App

```powershell
npm.cmd run dev
```

Default URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:4321`

If those ports are occupied:

```powershell
$env:ASSINI_DEV_API_PORT="44321"
$env:ASSINI_DEV_WEB_PORT="55173"
npm.cmd run dev
```

## Demo Mode

```powershell
npm.cmd run demo
```

This seeds the empty workspace, runs evaluation, and starts both local services.

## Model And Transcription Configuration

Extraction quality depends on the configured local model. All provider configuration is server-side environment variables; the browser only sees sanitized readiness from `GET /llm/status`.

- `ASSINI_LLM_PROVIDER`: `deterministic`, `openai-compatible`, `lm-studio`, `ollama`, or `openai`.
- `ASSINI_LLM_BASE_URL`: OpenAI-compatible base URL (for example `http://127.0.0.1:11434/v1` for Ollama).
- `ASSINI_LLM_MODEL`: model name.
- `ASSINI_LLM_API_KEY` or `OPENAI_API_KEY`: server-side key when the endpoint needs one.
- `ASSINI_LLM_TIMEOUT_MS`: positive integer timeout.
- `ASSINI_TRANSCRIBE_BASE_URL`: OpenAI-compatible `/audio/transcriptions` server for audio sources (for example a local whisper server). Required before audio sources can be processed.
- `ASSINI_TRANSCRIBE_MODEL`: transcription model name (defaults to `whisper-1`).
- `ASSINI_TRANSCRIBE_API_KEY`: optional transcription key.

Behavior by configuration:

- `deterministic` (the default) has no real model. Text and word-list sources fall back to offline heuristic parsing of delimited lines; image sources are rejected with a setup hint.
- Image sources need a vision-capable OpenAI-compatible model (for example llava via Ollama).
- Audio sources need `ASSINI_TRANSCRIBE_BASE_URL`; the transcript then flows through normal text extraction.

## Browser Verification

For frontend changes, verify the user workflow in a browser in addition to automated tests.

Useful smoke checks:

- Page title loads as `AssiniLang`.
- A new language can be created and appears in the sidebar.
- A pasted word-list source can be registered, processed, and its extraction drafts reviewed.
- Accepting a lexeme draft updates the language's lexicon and profile counts.
- Corpus Browser shows target text, translations, segmentation, and import controls.
- Corpus import can create a validated passage and refresh the visible passage count.
- Note Review Queue shows statuses and evidence counts.
- Learning Lab grades a correct answer.
- Evaluation Dashboard can run a system eval.
- Governance view can load policy, audit, disposition, and export controls.

## Building A Language From Raw Sources

The workspace has no hardcoded language data. To populate a language locally:

1. Create the language (`POST /languages` or the web console) with a name, typology, description, orthography, and optionally a phonology inventory. Declaring the inventory enables orthography validation for later corpus text.
2. Register or upload raw sources for it: pasted text, word lists, URLs, or files including images and audio.
3. Process each source (`POST /sources/:sourceId/process`) and review the proposed extraction drafts.
4. Accept the good drafts. Lexemes build the lexicon, corpus drafts build the corpus and its private answer keys, and grammar-note drafts enter the note review queue.
5. Author exercises against the accepted notes and lexicon, then run evaluation.

Validation tightens as the language grows: phonology scans apply once an inventory is declared, and morpheme grounding plus vocabulary checks apply once the lexicon is non-empty.

## Editing API Public Shapes

When changing public responses:

- Keep redaction/projection logic in `apps/api/src/publicLanguageViews.ts`.
- Add tests that assert private fields are omitted.
- Check snapshot and evaluation export integrity fields.
- Avoid logging or returning answer keys, learner answers, provider prompts, API keys, or hidden model traces.

## Editing Mutations

When adding a mutation route:

- Validate before mutation.
- Role-gate the route.
- Preserve state on validation failure.
- Add an audit event after successful mutation.
- Keep audit metadata minimal and non-private.
- Add red/green tests for success, invalid body, unknown language or entity, and forbidden role cases.

## Editing The Web App

When adding a workflow:

- Add API client tests for route construction, auth session behavior, and payload shape.
- Add app tests for the user workflow.
- Keep local form validation focused on obvious missing fields.
- Treat the API as the source of truth for domain validation.
- Extract reusable form parsing and payload-building logic into focused helper modules with direct tests.
- Run a browser smoke check after automated tests pass.

## Generated Files

Generated local data and build output are ignored by Git. Uploaded source files are stored under `data/assets/`. Reset the local workspace with:

```powershell
npm.cmd run seed
```

Legacy local databases from earlier schema versions (v1-v7) migrate forward automatically on read; reseeding is only needed when you want a clean workspace.
