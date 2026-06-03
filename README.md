# AssiniLang

AssiniLang is a local-first prototype for building and testing a language-learning AI workflow before any real community language data is used.

The current milestone uses only invented synthetic languages. The goal is to prove the workflow: seed language data, generate study notes, review those notes, grade learner exercises, and compare everything against answer keys.

## Current Status

This repository now contains a working full-stack slice:

- Four made-up languages with different linguistic patterns.
- Synthetic corpora, grammar notes, learner exercises, and answer keys.
- A JSON-backed local database.
- A deterministic evaluation harness with score reports.
- A Fastify API.
- Server-side learner exercise grading with persisted synthetic submissions.
- A Vite React web prototype for corpus browsing, note review, evaluation results, and exercise submission.

This is not a real-language deployment. It is the testbed that lets the project scale safely before any First Nations or Indigenous language material is introduced.

## Synthetic-Only Data Policy

No real First Nations, Indigenous, or community language data belongs in this milestone.

The fixture languages are fictional by design:

- `Avenik`: agglutinative suffix chains.
- `Solari`: isolating word order and particles.
- `Velari`: fusional endings.
- `Ketharu`: polysynthetic-lite verb forms.

Use this repository to test system behavior, not to represent real language communities.

## Quick Start

From the repository root:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run check
npm.cmd run seed
npm.cmd run eval
npm.cmd run dev
```

On macOS, Linux, or shells where the normal npm shim is available, the same commands work with `npm`.

Open the web prototype at:

```text
http://localhost:5173
```

The API runs at:

```text
http://localhost:4321
```

## One-Command Demo

```powershell
npm.cmd run demo
```

This seeds the synthetic database, runs the evaluation harness, and starts both the API and web app.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm.cmd test` | Runs all Vitest tests. |
| `npm.cmd run check` | Runs TypeScript project checks across packages and apps. |
| `npm.cmd run seed` | Writes synthetic fixture data to `data/local-db.json`. |
| `npm.cmd run eval` | Runs the deterministic evaluation CLI. |
| `npm.cmd run build` | Builds all workspaces that have a build script. |
| `npm.cmd run dev` | Starts the API and web app together. |
| `npm.cmd run demo` | Seeds, evaluates, and starts the local prototype. |

## Project Layout

```text
apps/
  api/                 Fastify API for languages, corpus, notes, exercises, and evaluations.
  web/                 React prototype for review, corpus browsing, exercises, and score reports.

packages/
  db/                  Zod schemas, TypeScript types, schema migration, and JSON persistence.
  synthetic-langs/     Fictional languages, corpora, grammar notes, exercises, and answer keys.
  eval/                Deterministic study-loop simulation and scoring logic.

data/
  local-db.json        Generated local database after `npm.cmd run seed`.

docs/
  specs/               Design notes for the current milestone.
  plans/               Implementation plan and task breakdown.
```

## What Works Today

### Synthetic Fixture System

`packages/synthetic-langs` defines four fictional languages. Each one includes corpus passages, morphological segmentation, grammar rules, note answer keys, learner exercises, and grading explanations.

### Immutable Answer Keys

The local state separates mutable review notes from immutable answer keys. Review actions update `notes`; evaluation scoring compares generated drafts against `noteAnswerKeys`.

This matters because the system should not score itself against whatever a reviewer last edited.

### Server-Side Exercise Submissions

Learner exercise answer keys stay inside the API/data layer. The public exercise API omits `expectedAnswers`, and learner answers are submitted to the server for grading and persistence.

Incorrect answers return a synthetic-safe explanation instead of revealing the answer key.

### Evaluation Harness

`packages/eval` scores each synthetic language across seven categories:

- Note coverage.
- Note accuracy.
- Evidence accuracy.
- Segmentation accuracy.
- Translation availability.
- Exercise grading.
- Generation-policy checks.

The current seeded baseline scores all four synthetic languages at 100%.

### API

The API currently exposes:

| Route | Purpose |
| --- | --- |
| `GET /health` | Health check. |
| `GET /languages` | List synthetic languages. |
| `GET /languages/:languageId/corpus` | Corpus passages for one language. |
| `GET /languages/:languageId/notes` | Review notes for one language. |
| `GET /languages/:languageId/exercises` | Learner exercises for one language without answer keys. |
| `GET /exercises/:exerciseId/submissions` | Persisted local learner submissions for one exercise. |
| `POST /exercises/:exerciseId/submissions` | Grade and persist a learner exercise answer. |
| `GET /evaluations` | Previous evaluation runs. |
| `POST /evaluations/run` | Run evaluation for all languages. |
| `PATCH /notes/:noteId/review` | Approve, contest, or update a note review. |

Unknown language IDs return `404`.

### Web Prototype

The web app includes:

- Language selector.
- Corpus Browser.
- Note Review Queue with Approve and Contest actions.
- Evaluation Dashboard.
- Learner Exercise Preview with server-side answer grading.
- Synthetic-data warning labels.

## What Is Missing Next

The current prototype proves the shape of the workflow, but several pieces are still missing before this becomes a serious language AI platform.

### 1. Real Governance Layer

Needed before real data:

- Community/project ownership records.
- Consent and license workflows.
- Data access rules by language, role, and corpus source.
- Audit trail for every data change.
- Clear policies for what the AI can and cannot generate.

### 2. Reviewer Accounts And Roles

Right now the reviewer is hardcoded as `local-reviewer`.

Next steps:

- Add users.
- Add roles such as reviewer, language lead, admin, and learner.
- Track who approved or contested each note.
- Require comments for contested notes.

### 3. Better Authoring Tools

The fixture data is currently written in TypeScript.

Next steps:

- Add a corpus import workflow.
- Add a note editor.
- Add exercise authoring.
- Add validation before saving.
- Export data snapshots for review.

### 4. Real Study Loop

The study loop is deterministic on purpose. It proves evaluation without calling an AI model.

Next steps:

- Add a model-backed draft generator.
- Compare model drafts to answer keys.
- Track uncertainty and failure reasons.
- Prevent hallucinated forms from entering approved notes.

### 5. Stronger Evaluation

The current evaluation is useful, but still small.

Next steps:

- Add more synthetic languages and dialect variants.
- Add adversarial exercises.
- Add regression reports over time.
- Add per-category thresholds.
- Add exportable evaluation artifacts.

### 6. Production Storage

The JSON store is good for local development, not production.

Next steps:

- Move to Postgres.
- Add migrations.
- Add proper IDs and timestamps.
- Add backups.
- Consider vector search only after the corpus governance model is clear.

### 7. Deployment And Security

No production deployment exists yet.

Next steps:

- Decide deployment target.
- Add environment variable handling.
- Add authentication.
- Add API rate limits.
- Add security review before any real data is connected.

## Development Workflow

Use this loop for safe changes:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run seed
npm.cmd run eval
```

For UI work, also run:

```powershell
npm.cmd run dev
```

Then verify the app in a browser at `http://localhost:5173`.

## Adding A New Synthetic Language

Add new fixture data in `packages/synthetic-langs/src/fixtures.ts`.

Each language should include:

- Language metadata.
- Vocabulary.
- Grammar rules.
- Corpus passages.
- Morphological segmentation.
- Note answer keys.
- Learner exercise answer keys.

After adding fixtures, run:

```powershell
npm.cmd test
npm.cmd run seed
npm.cmd run eval
```

## Documentation

- Design spec: `docs/specs/2026-06-03-synthetic-language-evaluation-platform-design.md`
- Implementation plan: `docs/plans/2026-06-03-synthetic-language-evaluation-platform.md`

## Repository State

The default branch is `master`.

The project is intentionally local-first right now. Generated data and build output are ignored by Git.

## Important Reminder

Do not add real community language data to this repository until governance, consent, access control, and review workflows are ready.
