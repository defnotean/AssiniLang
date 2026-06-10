# Development guide

This guide covers local setup, the quality gate, browser verification, and a walkthrough of building a language from raw sources. Maintainer change recipes (routes, views, schema, public shapes, docs) live in the [Maintenance Guide](maintenance.md); environment variables live in the [Configuration Reference](configuration.md).

## Requirements

- Node.js compatible with the repository lockfile (`>=20.19.0`).
- npm.
- PowerShell on Windows, or any shell that can run the equivalent npm commands.

## Install

```powershell
npm.cmd install
```

On macOS, Linux, or shells where the normal npm shim is available, use `npm` instead of `npm.cmd`.

## Local quality gate

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
npm.cmd run smoke
```

`npm.cmd run smoke` exercises the ingestion workflow end to end against an in-memory server.

## Start the app

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

## Demo mode

```powershell
npm.cmd run demo
```

This seeds the empty workspace, runs evaluation, and starts both local services.

## Model and transcription configuration

Extraction quality depends on the configured local model. All provider configuration is server-side environment variables; the browser only sees sanitized readiness from `GET /llm/status`. The [Configuration Reference](configuration.md) documents every variable (`ASSINI_LLM_*`, `ASSINI_TRANSCRIBE_*`, `ASSINI_OCR_LANG`, `ASSINI_ALLOW_PRIVATE_URLS`, and the rest) with defaults and ready-to-paste recipes for Ollama, LM Studio, generic OpenAI-compatible servers, local whisper servers, and deterministic mode.

## Building a language from raw sources

The workspace has no hardcoded language data. To populate a language locally:

1. Create the language (`POST /languages` or the web console's New language form in the sidebar) with a name, typology, description, orthography, and optionally a phonology inventory. Declaring the inventory enables orthography validation for later corpus text.
2. Register or upload raw sources for it in the Sources & intake view: pasted text, word lists, URLs, or files including images, audio, and PDF/DOCX documents.
3. Process each source (`POST /sources/:sourceId/process`; the console uses async mode and polls) and review the proposed extraction drafts. Duplicate badges flag drafts that repeat existing entries or other pending drafts.
4. Accept the good drafts. Lexemes build the lexicon, corpus drafts build the corpus and its private answer keys, and grammar-note drafts enter the note review queue.
5. Author exercises against the accepted notes and lexicon, then run evaluation.

Validation tightens as the language grows: phonology scans apply once an inventory is declared, and morpheme grounding plus vocabulary checks apply once the lexicon is non-empty.

## Browser verification

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

## Generated files

Generated local data and build output are ignored by Git. Uploaded source files are stored under `data/assets/`; OCR language data is cached under `data/ocr-cache/`. Reset the local workspace with:

```powershell
npm.cmd run seed
```

Legacy local databases from earlier schema versions (v1-v7) migrate forward automatically on read; reseeding is only needed when you want a clean workspace.
