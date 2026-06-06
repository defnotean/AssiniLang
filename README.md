# AssiniLang

AssiniLang is a local-first prototype for building and testing a language-learning AI workflow before any real community language data is used.

The current milestone uses only invented synthetic languages. It proves the workflow for corpus browsing, note review, learner exercises, evaluation, governance, audit trails, sanitized exports, and local model-provider readiness.

## Synthetic-Only Policy

Do not add real First Nations, Indigenous, or community language data to this repository yet.

The fixture languages are fictional by design:

- `Avenik`: agglutinative suffix chains.
- `Solari`: isolating word order and particles.
- `Velari`: fusional endings.
- `Ketharu`: polysynthetic-lite verb forms.

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

- Four synthetic languages with 40 corpus passages, 20 notes, 20 learner exercises, and immutable answer keys.
- A Fastify API backed by a JSON local database.
- A React web console for language profiles, corpus browsing/import, note review, learning exercises, evaluation, governance, elder corrections, and model setup.
- Role-aware local prototype users for learners, Elders, reviewers, leads, programmers, and admins.
- Review policies, disposition ledgers, audit events, and sanitized snapshot/evaluation exports with SHA-256 integrity manifests.
- A deterministic evaluation harness that currently scores all seeded synthetic languages at 100%.

## Common Commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run verify` | Runs tests, TypeScript checks, seed, eval, and builds. |
| `npm.cmd test` | Runs all Vitest tests. |
| `npm.cmd run check` | Runs TypeScript project checks. |
| `npm.cmd run seed` | Regenerates `data/local-db.json` from synthetic fixtures. |
| `npm.cmd run eval` | Runs the deterministic evaluation CLI. |
| `npm.cmd run dev` | Starts the API and web app together. |
| `npm.cmd run demo` | Seeds, evaluates, and starts the local prototype. |

## Documentation

Start here:

- [Documentation Hub](docs/README.md)
- [Product Guide](docs/product-guide.md)
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
  api/                 Fastify API and public redaction/export projection helpers.
  web/                 React research console.

packages/
  db/                  Zod schemas, TypeScript types, migrations, and JSON persistence.
  synthetic-langs/     Fictional languages, corpora, grammar notes, exercises, and answer keys.
  eval/                Deterministic study-loop simulation and scoring logic.

docs/                  Product, architecture, API, development, roadmap, spec, and plan docs.
```

## Repository State

The default branch is `master`.

The project is intentionally local-first right now. Generated data and build output are ignored by Git.
