# Development guide

This guide covers local setup, the quality gate, browser verification, and a walkthrough of building a language from raw sources. Maintainer change recipes (routes, views, schema, public shapes, docs) live in the [Maintenance Guide](maintenance.md); environment variables live in the [Configuration Reference](configuration.md).

## Requirements

- Node.js compatible with the repository lockfile (`^20.19.0 || >=22.12.0`; CI currently exercises Node 24.x).
- npm `>=10` (the repo pins `npm@11.11.1` via `packageManager`).
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
npm.cmd run smoke:backup
npm.cmd run ci:green
```

`npm.cmd run smoke` exercises the ingestion workflow end to end against an in-memory server.

`npm.cmd run smoke:backup` runs a JsonStore backup → corrupt live → restore round-trip, plus CLI refusal checks (directory / same-path / existing without `--force`), SQLite force-overwrite restore, and dry-run validation of an invalid workspace (CI also runs this after ingestion smoke).

`npm.cmd run ci:green` is a fast pre-push helper that audits production dependencies only (`npm audit --omit=dev --audit-level=moderate`). It complements CI’s full `npm audit` (which includes devDependencies) and does **not** replace `verify`, `smoke`, or `smoke:backup`.

### Deterministic evaluation baseline

The committed fixture at `fixtures/eval/testlang-baseline.json` captures the expected category scores for the Testlang seed workspace (`buildTestWorkspaceState` / `ASSINI_SEED_FIXTURE=1`). `packages/eval/src/testlangBaseline.test.ts` runs scoring against that fixture and asserts the live scores still match the baseline exactly.

### Beta verification and live-model checks

`npm.cmd run verify` stays fully deterministic: no network calls, no live model required.

`npm.cmd run verify:beta` is the optional beta gate for live-model verification. By default it prints a skip message and exits cleanly so CI stays green without a reachable model. To run the full `model:verify` pack locally, opt in explicitly:

```powershell
$env:ASSINI_VERIFY_MODEL="1"
$env:ASSINI_VERIFY_MODEL_NAME="Irene"
npm.cmd run verify:beta
```

`npm.cmd run model:verify` itself remains manual and opt-in. It needs a running API, reachable local model endpoint, and network access; do not wire it into default CI.

### Obsidian vault fixture

The committed pack at `fixtures/obsidian-vault/` is a tiny synthetic Velmari vault (lexicon, grammar note, empty skippable note, and a stub `.obsidian/` folder). Set `ASSINI_OBSIDIAN_VAULT_ROOTS` to the repo `fixtures/` directory, import `fixtures/obsidian-vault` in Build, and expect two language notes plus the README to register as pending text sources while `Language Notes/empty.md` is skipped. `apps/api/src/obsidianVaultFixture.test.ts` locks in those counts.

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

1. Create the language with a name, typology, description, and orthography. The web console's New language form in the sidebar collects those four fields; a phonology inventory can be supplied only through `POST /languages`. Declaring the inventory enables orthography validation for later corpus text.
2. Register or upload raw sources for it in the Build tab: pasted text, word lists, URLs, Obsidian Markdown vault imports, or files including images, audio, and PDF/DOCX documents.
3. Process each source (`POST /sources/:sourceId/process`; the console uses async mode and polls) and review the proposed extraction drafts. Duplicate badges flag drafts that repeat existing entries or other pending drafts.
4. Accept the good drafts. Lexemes build the lexicon, corpus drafts build the corpus and its private answer keys, and grammar-note drafts enter the note review queue.
5. Author exercises against the accepted notes and lexicon, then run evaluation.

Validation tightens as the language grows: phonology scans apply once an inventory is declared, and morpheme grounding plus vocabulary checks apply once the lexicon is non-empty.

To exercise the whole flow in one command against a running dev server, `node scripts/setupKelevi.mjs` builds "Kelevi" - a fully synthetic agglutinative demo language - end to end: provider health check, language creation with a CV phonology inventory, wordlist and text ingestion (model-backed when `ASSINI_LLM_*` is configured), bulk draft review, validated segmented corpus imports, model-drafted grammar notes with grounding scores, exercise authoring and grading, spaced-repetition recommendations, and an evaluation run. It needs `ASSINI_DEV_AUTH_TOKEN` to match the running API (scripts default to `dev-local`, same as `.env.example` and the other local driver scripts; an unset API token yields `401`) and resets nothing by itself; run `npm.cmd run seed` first for a clean slate.

## Browser verification

For frontend changes, verify the user workflow in a browser in addition to automated tests.

Useful smoke checks:

- Page title loads as `AssiniLang`.
- With no language selected, Build/Practice/Chat show the select-or-create empty state with a New language sidebar hint.
- A new language can be created and appears in the sidebar.
- A pasted word-list source can be registered, processed, and its extraction drafts reviewed.
- Accepting a lexeme draft updates the language's lexicon and profile counts.
- Start examples show target text, translations, segmentation, import controls, interlinear display, concordance filtering, and graph mode.
- Corpus import can create a validated passage and refresh the visible passage count.
- Build review shows note statuses and evidence counts.
- Practice grades a correct answer.
- Settings can discover/test models, switch saved profiles, run a system eval, and load policy, audit, disposition, and export controls.

## Generated files

Generated local data and build output are ignored by Git. Uploaded source files are stored under `data/assets/`; OCR language data is cached under `data/ocr-cache/`. Reset the local workspace with:

```powershell
npm.cmd run seed
```

Legacy local databases from earlier schema versions (v1-v7) migrate forward automatically on read; reseeding is only needed when you want a clean workspace.
