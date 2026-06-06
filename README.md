# AssiniLang

AssiniLang is a local-first prototype for building and testing a language-learning AI workflow before any real community language data is used.

The current milestone uses only invented synthetic languages. The goal is to prove the workflow: seed language data, generate study notes, review those notes, grade learner exercises, and compare everything against answer keys.

## Current Status

This repository now contains a working full-stack slice:

- Four made-up languages with different linguistic patterns.
- A 40-passage synthetic corpus: ten passages per language.
- Twenty grammar notes, twenty learner exercises, and immutable answer keys.
- A JSON-backed local database.
- A deterministic evaluation harness with score reports.
- A Fastify API.
- Server-side learner exercise grading with persisted synthetic submissions.
- Local prototype users with role-aware API permissions for learners, Elders, reviewers, leads, programmers, and admins.
- Local governance policy records for synthetic consent, access, and generation rules.
- Seeded per-language review policies with assigned reviewer lists and approval thresholds.
- Assigned review-disposition work records for rejected, deferred, escalated, and contested notes, with a Governance ledger for resolution.
- A role-gated audit ledger for synthetic data mutations across reviews, review policies, review dispositions, submissions, evaluations, AI sessions, governance records, and elder corrections.
- SHA-256 integrity manifests on sanitized review and evaluation exports.
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
npm.cmd run verify
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

If those ports are already in use, the root dev launcher accepts explicit overrides:

```powershell
$env:ASSINI_DEV_API_PORT="44321"
$env:ASSINI_DEV_WEB_PORT="55173"
npm.cmd run dev
```

## One-Command Demo

```powershell
npm.cmd run demo
```

This seeds the synthetic database, runs the evaluation harness, and starts both the API and web app.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm.cmd run verify` | Runs the full local quality gate: tests, TypeScript checks, seed, eval, and build. |
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
  api/                 Fastify API plus public redaction/profile/export projection helpers.
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

`packages/synthetic-langs` defines four fictional languages. Each one includes ten corpus passages, five grammar rules, five note answer keys, five learner exercises, curated adversarial exercise probes, morphological segmentation, structured phonology, paradigm tables, two public dialect variants, and grading explanations.

The fixture set now covers a wider spread of synthetic phenomena:

- `Avenik`: transparent verb suffix chains, noun case suffixes, coordination suffixes, demo-agent marking, and lesson-setting locatives.
- `Solari`: isolating SVO clauses, past particles, final locative phrases, object coordination, and durative aspect particles.
- `Velari`: fused person-tense endings across present, past, and future, with object-after-verb clauses.
- `Ketharu`: subject/object/root/time slot chains, compound object-prefix stacks, linked predicate chains, and display-table aspect suffixes.

Fixture loading now runs explicit cross-reference validation before seed state construction. Broken evidence passage IDs, duplicated fixture IDs, duplicated dialect variant IDs, empty dialect labels or note sections, mismatched language IDs, vocabulary or public forms that use symbols outside the language phonology inventory, corpus morphemes that are not grounded by vocabulary surface or lemma, missing exercise rules, unknown allowed vocabulary, invalid `choose_particle` answers, `translate_to_target` answers that are not present in the corpus, adversarial exercise probes that duplicate accepted answers, note `evidenceCount` drift, and note examples whose text no longer matches their cited corpus passage fail with actionable diagnostics.

Validation rules live in `packages/synthetic-langs/src/validation.ts`; seed-state cloning and answer-key materialization live in `packages/synthetic-langs/src/loader.ts`.

### Immutable Answer Keys

The local state separates mutable review notes from immutable answer keys. Review actions update `notes`; evaluation scoring compares generated drafts against `noteAnswerKeys`.

This matters because the system should not score itself against whatever a reviewer last edited.

### Local Database Recovery

The generated local database lives at `data/local-db.json`. `JsonStore` writes through a temporary file and rename so normal writes are atomic. If the file is manually edited or corrupted, startup/read errors include the exact database path. Regenerate the synthetic baseline with:

```powershell
npm.cmd run seed
```

### Server-Side Exercise Submissions

Learner exercise answer keys stay inside the API/data layer. The public exercise API omits `expectedAnswers`, curated `adversarialAnswers`, and grading explanations; learner answers are submitted to the server for grading and persistence.

Incorrect answers return a synthetic-safe explanation instead of revealing the answer key.

Public API projections live in `apps/api/src/publicLanguageViews.ts`. Keep answer-key stripping, internal note marker filtering, language profile construction, and review snapshot construction there instead of embedding public data-shaping logic directly in route handlers.

### Local Governance Policy Records

The API can record synthetic consent, access, and generation policies for an existing language. Governance writes are role-gated to Elders, leads, and admins, and each record stores the approving actor.

Leads and admins can also maintain a per-language `ReviewPolicy` with assigned reviewer IDs, an approval threshold, and an assigned-reviewer requirement. The synthetic seed creates a default two-reviewer policy for every language so the local Governance view starts without missing-policy alerts. When a policy exists, approving a note records individual `ReviewApproval` entries; notes remain `under_review` until the configured threshold is met, and unassigned reviewers are rejected when assignment is required.

Rejected, deferred, escalated, and contested note dispositions open `ReviewDisposition` work records with a reason, assignee, optional due date, opener, and resolution fields. The assigned reviewer, leads, and admins can resolve disposition records; resolving one returns the linked note to `under_review` and appends a note edit-history entry. The Governance view loads this work ledger, shows assignee and due-date context, and lets authorized local users submit a resolution summary.

Mutating API routes append `AuditEvent` records to the local database. Leads, admins, and programmers can read the ledger from `GET /audit/events`, optionally filtered with `?languageId=...`. The events record actor, role, action, entity type, entity ID, language ID, timestamp, summary, and minimal metadata without storing learner answers, provider prompts, answer keys, or hidden model traces.

This is still a prototype safety rail, not a substitute for real community ownership, consent, or legal review.

### Safe Review Snapshot Exports

Reviewers, Elders, leads, and admins can export a sanitized synthetic-language snapshot from `GET /exports/languages/:languageId/snapshot`.

The snapshot includes language metadata, the public linguistic profile (phonology, paradigm tables, dialect variants, vocabulary, grammar rules, and counts), corpus passages, public review notes, public learner exercise prompts, governance records, and evaluation summaries for one language. It intentionally excludes immutable answer keys, learner submissions, learner answers, AI sessions, local users, and other internal state.

Each snapshot includes an `integrity` manifest with the local export generator ID, SHA-256 content hash, and redaction policy list. The hash is computed over the sanitized payload before the manifest is attached, so reviewers can detect accidental packet changes without exposing private answer keys or learner data.

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

`npm.cmd run eval` also acts as a fixture quality gate: it exits nonzero and prints traceable failure lines if any language produces structured evaluation failures or if a category score drops below its threshold. The default category floor is 96%, while generation-policy checks must stay at 100% so hallucinated or unapproved forms fail immediately. Sanitized evaluation artifacts include latest-vs-previous trend records, regression/improvement counts, per-category score deltas, and the same SHA-256 integrity manifest for longitudinal checks.

Exercise grading checks both accepted answers and rejection behavior. Each fixture exercise includes two private adversarial probes for plausible learner/model mistakes, and the evaluator fails if any curated adversarial answer is accepted.

### API

The API currently exposes:

| Route | Purpose |
| --- | --- |
| `GET /health` | Health check. |
| `GET /languages` | List synthetic languages. |
| `GET /languages/:languageId/profile` | Rich synthetic profile with language metadata, phonology, paradigm tables, dialect variants, public vocabulary, grammar rules, and counts. |
| `GET /languages/:languageId/corpus` | Corpus passages for one language. |
| `POST /languages/:languageId/corpus` | Role-gated synthetic corpus import with provenance, synthetic consent metadata, segmentation validation, and audit metadata. |
| `GET /languages/:languageId/notes` | Review notes for one language. |
| `GET /languages/:languageId/exercises` | Learner exercises for one language without answer keys. |
| `POST /languages/:languageId/exercises` | Role-gated exercise authoring with rule/vocabulary validation, private answer-key storage, public response redaction, and audit metadata. |
| `GET /exports/languages/:languageId/snapshot` | Role-gated sanitized review snapshot with public linguistic profile data and a SHA-256 integrity manifest for one synthetic language. |
| `GET /languages/:languageId/elder-context` | Role-gated elder review context with public corpus, notes, governance records, and submitted corrections. |
| `GET /elder/corrections` | Role-gated correction ledger, optionally filtered by language ID. |
| `POST /elder/corrections` | Let Elders, leads, or admins submit pending correction records without mutating notes. |
| `PATCH /elder/corrections/:correctionId/review` | Let Elders, leads, or admins accept or reject submitted corrections with reviewer attribution. |
| `PATCH /elder/corrections/:correctionId/apply` | Apply an accepted note-linked correction through an explicit revised explanation and note edit-history entry. |
| `GET /exports/evaluations/artifact` | Role-gated sanitized evaluation artifact with latest-run scores, trend deltas, aggregate gate status, failure lines, and a SHA-256 integrity manifest. |
| `GET /exercises/:exerciseId/submissions` | Persisted local learner submissions for one exercise. |
| `POST /exercises/:exerciseId/submissions` | Grade and persist a learner exercise answer. |
| `GET /evaluations` | Previous evaluation runs. |
| `POST /evaluations/run` | Run evaluation for all languages. |
| `GET /governance` | List local synthetic governance policy records. |
| `POST /governance` | Create a consent, access, or generation policy record for an existing language. |
| `GET /languages/:languageId/review-policy` | Role-gated review-policy lookup for one language. |
| `PUT /languages/:languageId/review-policy` | Let leads or admins assign reviewers and approval thresholds for one language. |
| `GET /languages/:languageId/review-dispositions` | Role-gated review-disposition ledger for one language. |
| `PATCH /review-dispositions/:dispositionId/resolve` | Let the assignee, a lead, or an admin resolve a review disposition and return the note to review. |
| `GET /audit/events` | Role-gated synthetic audit ledger for persisted data mutations, optionally filtered by `languageId`. |
| `PATCH /notes/:noteId/review` | Approve, contest, reject, defer, escalate, or update a note review with authenticated attribution, policy-threshold enforcement, and disposition-work creation. |

Unknown language IDs return `404`.

### Web Prototype

The web app includes:

- Language selector.
- Language Profile with phonology, dialect variant, paradigm, grammar-rule, and vocabulary inventories.
- Corpus Browser with reviewer corpus-import controls for provenance, consent, topic tags, and morpheme segmentation.
- Note Review Queue with server-validated explanation editing plus approve, contest, reject, defer, and escalate actions.
- Evaluation Dashboard with latest score cards, regression trend cards, and downloadable sanitized evaluation artifacts.
- Learner Exercise Preview with server-side answer grading and compact exercise authoring controls.
- Governance view with local synthetic policy-record creation, review-policy assignment controls, review-disposition resolution work, and a filtered audit ledger.
- Downloadable sanitized review snapshots with phonology, dialect variant, paradigm, vocabulary, grammar-rule metadata, and visible integrity hash prefixes from the Governance view.
- Elder Workspace with correction submission, correction-ledger review, accepted/rejected audit attribution, and explicit application of accepted note-linked corrections.
- Synthetic-data warning labels.

## What Is Missing Next

The current prototype proves the shape of the workflow, but several pieces are still missing before this becomes a serious language AI platform.

### 1. Real Governance Layer

Needed before real data:

- Community/project ownership records.
- Production consent and license workflows.
- Enforceable data access rules by language, role, and corpus source.
- Tamper-evident production audit retention, external export receipts, and community-facing audit review workflows.
- Clear policies for what the AI can and cannot generate.

### 2. Production Accounts And Review Policy

The local prototype has role-aware users, records who reviewed each note, and can enforce per-language reviewer assignments plus approval thresholds before notes move to `approved`. Contested, rejected, deferred, and escalated note dispositions require reviewer comments so future reviewers can see why content moved out of the approval path. Elder correction records can also be accepted or rejected with reviewer attribution, and accepted note-linked corrections can be applied through a revised explanation that adds a note edit-history entry and moves the correction to `applied`.

Next steps:

- Replace prototype auth with production authentication.
- Connect roles to project/community membership records.
- Bind per-language reviewer assignments to production membership records.
- Add production notifications, SLA reports, and external review receipts for disposition workflows.

### 3. Better Authoring Tools

The fixture data is currently written in TypeScript.

Next steps:

- Expand the note editor beyond review-queue explanation edits.
- Expand web exercise authoring beyond compact single-probe controls.
- Expand validation before saving beyond note explanation edits.
- Add externally signed, permission-scoped export receipts for production review workflows.

### 4. Real Study Loop

The study loop is deterministic on purpose. It proves evaluation without calling an AI model.

The AI session surface can use a server-side OpenAI-compatible provider for local or remote models. Keep provider keys only in the API environment, never in browser code. Useful variables:

- `ASSINI_LLM_PROVIDER`: `deterministic`, `openai-compatible`, `lm-studio`, `ollama`, or `openai`.
- `ASSINI_LLM_BASE_URL`: OpenAI-compatible base URL such as `http://127.0.0.1:11434/v1`.
- `ASSINI_LLM_MODEL`: model name.
- `ASSINI_LLM_API_KEY` or `OPENAI_API_KEY`: server-side key for remote providers.
- `ASSINI_LLM_TIMEOUT_MS`: positive integer timeout. Invalid values fall back to `30000` and appear as readiness warnings; timed-out provider calls report an explicit timeout error.

Non-OK provider responses include status plus sanitized provider error details when available. API-key-shaped values are redacted before errors are returned or logged, and AI session routes preserve those sanitized diagnostics in `502` responses. Valid AI session attempts that fail during provider generation are also stored as `failed` sessions with a public trace entry, so `/observability/ai-sessions` and neural-map views can show the failure without exposing provider secrets or hidden chain-of-thought.

Next steps:

- Add a model-backed draft generator.
- Compare model drafts to answer keys.
- Track uncertainty and failure reasons.
- Prevent hallucinated forms from entering approved notes.

### 5. Stronger Evaluation

The current evaluation is useful, but still small.

Next steps:

- Add more synthetic languages and deeper dialect histories.
- Add historical sparkline charts and retained baseline comparisons.

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

For the full local gate in one command, run:

```powershell
npm.cmd run verify
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
- Structured phonology and phonotactic notes that cover every public vocabulary, corpus, and paradigm form.
- At least two paradigm tables with vocabulary-backed morphemes.
- At least two public dialect variants with phonology, lexical, grammar, and example-phrase notes.
- Vocabulary.
- At least five grammar rules.
- At least ten corpus passages.
- Morphological segmentation.
- Five note answer keys derived from those grammar rules.
- At least five learner exercise answer keys with at least two exercise types and two curated adversarial probes per exercise.

After adding fixtures, run:

```powershell
npm.cmd run verify
```

## Documentation

- Design spec: `docs/specs/2026-06-03-synthetic-language-evaluation-platform-design.md`
- Implementation plan: `docs/plans/2026-06-03-synthetic-language-evaluation-platform.md`

## Repository State

The default branch is `master`.

The project is intentionally local-first right now. Generated data and build output are ignored by Git.

## Important Reminder

Do not add real community language data to this repository until governance, consent, access control, and review workflows are ready.
