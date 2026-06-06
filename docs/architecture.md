# Architecture And Data

AssiniLang is organized as a local-first TypeScript monorepo. The system keeps private answer keys and internal traces in the API/data layer while the web app receives only public or role-appropriate projections.

## Workspace Layout

```text
apps/
  api/                 Fastify API, auth checks, route handlers, redaction, snapshots, and LLM provider wiring.
  web/                 React research console.

packages/
  db/                  Zod schemas, TypeScript types, JSON persistence, and migration helpers.
  synthetic-langs/     Synthetic fixtures, fixture validation, and seed-state construction.
  eval/                Deterministic study-loop generation, answer grading, and evaluation scoring.

docs/                  Product, architecture, API, development, roadmap, spec, and plan docs.
```

## Data Flow

1. Synthetic fixture data is defined in `packages/synthetic-langs/src/fixtures.ts`.
2. Fixture validation runs before seed-state construction.
3. `npm.cmd run seed` writes generated local state to `data/local-db.json`.
4. The Fastify API reads and mutates the JSON-backed state through `JsonStore`.
5. Public projection helpers strip private fields before data reaches the web app.
6. The React app drives review, corpus import, exercise submission, governance, exports, and observability workflows through API calls.
7. `npm.cmd run eval` compares generated and mutable state against immutable answer keys.

## Synthetic Fixtures

Each synthetic language should include:

- Language metadata.
- Structured phonology and phonotactic notes.
- Public vocabulary with at least 20 lexemes, particles, endings, prefixes, or other usable forms.
- Corpus passages with translation and morpheme segmentation.
- Grammar rules.
- Note answer keys.
- Learner exercise answer keys.
- At least two private adversarial exercise probes.
- Paradigm tables.
- Dialect variants.

Fixture loading validates cross-references, linguistic consistency, and fixture depth. It rejects broken evidence IDs, duplicate IDs, empty dialect labels, undersized phonology inventories, missing stress or syllable-template metadata, lexicons below 20 public vocabulary items, corpus/rule/note/exercise/paradigm/dialect sets below the synthetic milestone floor, mismatched language IDs, public forms outside the phonology inventory, corpus tokens that are not covered by segmentation, corpus morphemes not grounded by vocabulary surface or lemma, duplicate corpus topic tags, duplicate morpheme feature labels, missing exercise rules, unknown or duplicate allowed exercise vocabulary and rules, duplicate expected exercise answers, invalid particle answers, target-language answers absent from the corpus, adversarial probes that duplicate accepted or adversarial answers, note evidence-count drift, and note examples that no longer match their cited corpus passage.

Validation rules live in `packages/synthetic-langs/src/validation.ts`; seed-state cloning and answer-key materialization live in `packages/synthetic-langs/src/loader.ts`.
The shared orthography scanner is exported so fixture validation and live API imports use the same phonology-inventory rules.

## Local Persistence

The generated local database lives at `data/local-db.json`. `JsonStore` writes through a temporary file and rename so normal writes are atomic.

If the file is manually edited or corrupted, startup/read errors include the exact database path. Regenerate the synthetic baseline with:

```powershell
npm.cmd run seed
```

The JSON store is for local development only. Production storage should move to a database with migrations, backups, access control, and operational observability.

## Answer-Key Separation

The state separates mutable review records from immutable answer keys:

- `notes` are reviewer-facing mutable drafts.
- `noteAnswerKeys` are immutable evaluation references.
- `exercises` are stored with private expected answers and adversarial probes.
- Public exercise responses omit answer keys and grading explanations.
- `corpusAnswerKeys` preserve expected corpus segmentation for evaluation.

This matters because the system must not evaluate itself against whatever a reviewer last edited.

## Public Projection Layer

Public data shaping belongs in `apps/api/src/publicLanguageViews.ts`.

Keep these responsibilities there:

- Stripping answer keys from exercises.
- Removing internal note markers.
- Building rich language profiles.
- Deriving public morpheme inventories from corpus segmentation and vocabulary metadata.
- Building sanitized language snapshots.
- Building sanitized evaluation artifacts.
- Computing visible integrity manifests.

Route handlers should stay focused on auth, validation, mutation, and response status.

## Mutation And Audit Rules

Mutating API routes append `AuditEvent` records when they change persistent state. Events record:

- Actor and role.
- Action.
- Entity type and ID.
- Language ID.
- Timestamp.
- Human-readable summary.
- Minimal metadata.

Audit metadata must not include learner answers, answer keys, provider prompts, hidden model traces, API keys, or other private payloads.

## Corpus Import Integrity

Corpus imports are treated as synthetic source-data mutations. They are role-gated and validated before persistence.

The API rejects imports when:

- The language ID is unknown.
- The body is malformed.
- Target text duplicates an existing passage for the language.
- A segmentation surface does not appear in the target text.
- A target-text token is not covered by one or more contiguous segmentation surfaces.
- Target text uses a symbol outside the selected language phonology inventory.
- A morpheme is not grounded by the selected language vocabulary surface or lemma.
- Synthetic consent metadata is missing or not `synthetic-testing-only`.

Successful imports append the passage and write an audit event with source, morpheme count, tag count, consent-use label, and restriction count.

## Evaluation Harness

`packages/eval` runs deterministic study-loop and scoring logic. The current evaluation categories are:

- Note coverage.
- Note accuracy.
- Evidence accuracy.
- Segmentation accuracy.
- Translation availability.
- Exercise grading.
- Generation policy.

Most categories use a 96% minimum threshold. Generation policy requires 100% because unapproved forms should never enter learner-facing output.

## LLM Provider Boundary

LLM provider configuration is server-only. The browser can view readiness status but must never receive provider API keys.

Useful environment variables:

- `ASSINI_LLM_PROVIDER`: `deterministic`, `openai-compatible`, `lm-studio`, `ollama`, or `openai`.
- `ASSINI_LLM_BASE_URL`: OpenAI-compatible base URL.
- `ASSINI_LLM_MODEL`: model name.
- `ASSINI_LLM_API_KEY` or `OPENAI_API_KEY`: server-side key.
- `ASSINI_LLM_TIMEOUT_MS`: positive integer timeout.

Provider errors are sanitized before returning to clients or storing observable session records.
