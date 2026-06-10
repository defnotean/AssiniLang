# AssiniLang

AssiniLang is a local-first prototype for building and testing a language-learning AI workflow before any real community language data is used.

The current milestone starts from an empty workspace. Users create their own languages and feed them from their own raw materials through a local-LLM ingestion pipeline. Every extracted item is a reviewable draft before it becomes lexicon, corpus, or grammar data. Corpus browsing, note review, learner exercises, evaluation, governance, audit trails, sanitized exports, and local model-provider readiness work as before.

## Data Stewardship

The workspace ships empty. All language data is created by users from raw materials they bring themselves, and every corpus passage carries consent and provenance metadata.

Do not connect real First Nations, Indigenous, or community language data without the governance, consent, access-control, and review infrastructure described in the [Roadmap](docs/roadmap.md). The prototype is a workflow testbed, not a stewardship platform.

## Quick Start

From the repository root:

```powershell
npm.cmd install
npm.cmd run verify
npm.cmd run dev
```

Open the web prototype at:

```text
http://localhost:5173
```

The API runs at:

```text
http://localhost:4321
```

If those ports are already in use:

```powershell
$env:ASSINI_DEV_API_PORT="44321"
$env:ASSINI_DEV_WEB_PORT="55173"
npm.cmd run dev
```

## What Works

- Empty-workspace bootstrap: `npm.cmd run seed` writes `data/local-db.json` with the local prototype users and no languages.
- Language creation and editing with typology, orthography, and an optional declared phonology inventory.
- Raw source ingestion per language: pasted text, word lists, URLs, and file uploads including images and audio.
- Local-LLM extraction of lexemes, corpus passages, and grammar notes, with offline heuristic parsing of delimited lines when no model is configured.
- Draft review: each extracted item is an extraction draft that a reviewer accepts or rejects before it becomes workspace data.
- A Fastify API backed by a JSON local database.
- A React web console for language profiles, corpus browsing/import, note review, learning exercises, evaluation, governance, elder corrections, and model setup.
- Leadless browser prototype sessions for learners, Elders, reviewers, and programmers, with lead/admin authority retained server-side for policy integrity.
- Review policies, disposition ledgers, audit events, and sanitized snapshot/evaluation exports with SHA-256 integrity manifests.
- A deterministic evaluation harness that scores workspace languages against immutable answer keys.

## Common Commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run verify` | Runs tests, TypeScript checks, seed, eval, and builds. |
| `npm.cmd test` | Runs all Vitest tests. |
| `npm.cmd run check` | Runs TypeScript project checks. |
| `npm.cmd run seed` | Initializes an empty workspace at `data/local-db.json`. |
| `npm.cmd run eval` | Runs the deterministic evaluation CLI. |
| `npm.cmd run dev` | Starts the API and web app together. |
| `npm.cmd run demo` | Seeds, evaluates, and starts the local prototype. |

## Documentation

Start here:

- [Documentation Hub](docs/README.md)
- [Product Guide](docs/product-guide.md)
- [UI Design Guide](docs/ui-design.md)
- [Architecture And Data](docs/architecture.md)
- [API Reference](docs/api.md)
- [Development Guide](docs/development.md)
- [Roadmap](docs/roadmap.md)

Detailed design history lives in:

- [Synthetic Language Evaluation Platform Spec](docs/specs/2026-06-03-synthetic-language-evaluation-platform-design.md)
- [Implementation Plan](docs/plans/2026-06-03-synthetic-language-evaluation-platform.md)

## Repository Map

```text
apps/
  api/                 Fastify API, raw-source ingestion pipeline, LLM/transcription provider wiring, and public redaction/export projection helpers.
  web/                 React research console.

packages/
  db/                  Zod schemas, TypeScript types, migrations, bootstrap/seed CLI, and JSON persistence.
  eval/                Deterministic study-loop simulation and scoring logic.

docs/                  Product, architecture, API, development, roadmap, spec, and plan docs.
```

## Repository State

The default branch is `master`.

The project is intentionally local-first right now. Generated data and build output are ignored by Git.
