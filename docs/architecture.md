# Architecture And Data

AssiniLang is organized as a local-first TypeScript monorepo. The system keeps private answer keys and internal traces in the API/data layer while the web app receives only public or role-appropriate projections.

## Workspace Layout

```text
apps/
  api/                 Fastify API, auth checks, route handlers, raw-source ingestion pipeline, redaction, snapshots, and LLM/transcription provider wiring.
  web/                 React research console.

packages/
  db/                  Zod schemas, TypeScript types, JSON persistence, migrations, and the empty-workspace bootstrap/seed CLI.
  eval/                Deterministic study-loop generation, answer grading, and evaluation scoring.

docs/                  Product, architecture, API, development, roadmap, spec, and plan docs.
```

## Data Flow

1. `npm.cmd run seed` writes an empty workspace to `data/local-db.json`: the local prototype users and no languages.
2. Users create languages through `POST /languages` with name, typology, description, orthography, and an optional phonology inventory.
3. Raw materials are registered or uploaded as source assets: pasted text, word lists, URLs, images, audio, and plain-text documents.
4. `POST /sources/:sourceId/process` runs the ingestion pipeline, turning a source asset into proposed extraction drafts.
5. Reviewers accept or reject each draft. Accepted drafts commit lexemes, corpus passages with private answer keys, or grammar notes.
6. The Fastify API reads and mutates the JSON-backed state through `JsonStore`; public projection helpers strip private fields before data reaches the web app.
7. The React app drives ingestion, review, corpus import, exercise submission, governance, exports, and observability workflows through API calls.
8. `npm.cmd run eval` compares drafted and mutable state against immutable answer keys.

## Core Collections

The persisted app state (schemaVersion 8) keeps these collections beside the existing corpus, notes, exercises, governance, review, and audit records:

- `languages`: user-created language records. `status` is `active`, `draft`, or `archived`. Each language may carry an optional `phonology` object (`consonants`, `vowels`, optional `syllableTemplate` and `stress`, `notes`) plus optional `createdBy` and `createdAt` fields.
- `lexemes`: the per-language lexicon. Each lexeme keeps `form`, `gloss`, `partOfSpeech`, `tags`, and `sourceAssetIds` linking it back to the raw materials it came from.
- `sourceAssets`: registered raw materials. `kind` is `text`, `wordlist`, `url`, `image`, `audio`, or `document`; `status` is `pending`, `processing`, `processed`, `failed`, or `archived`. Assets store `rawText`, `url`, or a `filePath` under `data/`, plus an optional `transcript` for audio.
- `extractionDrafts`: reviewable extraction output. `kind` is `lexeme`, `corpus_passage`, or `grammar_note`; each draft carries a `payload`, a `confidence` level, an optional `rationale`, and a `status` of `proposed`, `accepted`, or `rejected` with `reviewedBy`/`reviewedAt` and a `committedEntityId` once accepted.

`consentStatus.use` on corpus passages is an enum (`CONSENT_USE_VALUES`): `testing-only`, `community-approved`, `personal-study`, `research`, `public-domain`, `licensed`, or `pending-review`.

## Ingestion Pipeline

Source processing lives in `apps/api/src/ingestion.ts` and is driven by the server-side LLM provider:

- `text` and `wordlist` sources go to LLM extraction. When no real model is configured (deterministic mode), an offline heuristic parses delimited lines (`=`, `-`, tab, pipe) into low-confidence lexeme or passage drafts instead.
- `url` sources are fetched server-side (http/https only, size-capped), converted from HTML to text, then extracted. An SSRF guard blocks URLs that point at private or local networks: `localhost`/`*.localhost`/`*.local` hostnames, private/reserved IPv4 literals (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8), loopback/link-local/unique-local IPv6 literals (`::1`, fe80::/10, fc00::/7), and public-looking hostnames whose DNS lookup resolves to one of those ranges. Set `ASSINI_ALLOW_PRIVATE_URLS=1` (or `true`) to skip these checks in a trusted local setup.
- `image` sources require a vision-capable OpenAI-compatible model; the image is sent as base64 content.
- `audio` sources are transcribed through an OpenAI-compatible `/audio/transcriptions` endpoint (`ASSINI_TRANSCRIBE_BASE_URL`), then the transcript goes through LLM extraction.
- `document` sources accept plain-text formats (txt, md, csv, tsv, json) plus PDF (parsed with `unpdf`) and DOCX (parsed with `mammoth`). PDF/DOCX files with no extractable text (for example scanned images) fail with a clear error; OCR is not supported yet.

Long sources are no longer truncated. Normalized text is split into chunks of roughly 12,000 characters on paragraph/line boundaries, and up to 8 chunks are processed sequentially through the model (each user message carries a "part N of M" note). Per-chunk results are merged: candidates are deduplicated (lexemes by case-insensitive form+gloss, corpus passages by target text, grammar notes by topic+explanation), capped at 100 per kind overall, and chunk summaries are combined into one short summary. Text beyond 8 chunks is skipped with a warning that reports how many characters were left unprocessed. A chunk whose model output cannot be parsed adds a warning and is skipped; if every chunk fails, the offline heuristic runs on the full text. The offline heuristic path always runs on the full untruncated text.

Because chunked extraction through a slow local model can take minutes, `POST /sources/:sourceId/process` also accepts `{ "async": true }`: the server marks the asset `processing`, returns `202` immediately, and runs the same extraction in a background task that persists drafts, asset status, and the audit event through the same state mutation as the synchronous path. The web console uses this mode and polls the source list every 2.5 seconds until the asset leaves `processing`.

Extraction output is never committed directly. Accepting a draft commits a lexeme, a corpus passage (with a derived private answer key; missing or incomplete segmentation falls back to honest token-level "unanalyzed" morphemes), or a grammar note that enters the normal review workflow as a `draft`. Uploaded files are stored under `data/assets/` with a 25 MB cap per file.

## Local Persistence

The generated local database lives at `data/local-db.json`. `JsonStore` writes through a temporary file and rename so normal writes are atomic.

The current schema version is 8. Legacy v1-v7 local databases migrate forward automatically on read; older state gains empty `lexemes`, `sourceAssets`, and `extractionDrafts` collections and keeps its existing records.

Persisted top-level records must keep stable nonblank unique IDs inside each app-state collection. The schema validates referential integrity during local JSON reads: language IDs on corpus, notes, exercises, lexemes, sourceAssets, extractionDrafts, and governance/review/audit records must resolve to existing languages; answer keys must point at existing same-language passages; actor attribution must use known local users in allowed roles; timestamps must stay parseable and chronologically consistent. Corrupted or manually edited local JSON fails loudly with the exact database path instead of leaking malformed records into public views.

Seeded local databases include six local user identities used by review policies, audit attribution, and backend authorization: learner, Elder, reviewer, lead, programmer, and admin. The web console opens HTTP-only prototype sessions only for learner, Elder, reviewer, and programmer users; lead/admin identities remain server-token authorities for persisted policy ownership and administrative workflows.

Regenerate the empty workspace with:

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
- `exerciseSubmissions` keep learner answers and actor IDs server-side; public submission views redact both fields.
- `corpusAnswerKeys` preserve expected corpus segmentation for evaluation.

This matters because the system must not evaluate itself against whatever a reviewer last edited.

Live corpus imports and accepted corpus extraction drafts both store the passage publicly while deriving a private corpus answer key from the validated target text, translation, and segmentation. Persisted reads reject answer keys that reference missing passages, cross language boundaries, carry blank text or morpheme fields, or lose their own segmentation coverage.

## Public Projection Layer

Public data shaping belongs in `apps/api/src/publicLanguageViews.ts`. Profiles and snapshots are derived entirely from workspace state:

- Vocabulary comes from the language's lexicon.
- The morpheme inventory is derived from corpus segmentation with occurrence counts, passage IDs, glosses, features, and linked lexeme metadata.
- Grammar rules are the language's public notes.
- Stats include corpus, note, exercise, source-asset, and pending-extraction-draft counts.

There are no fixture minimums or fixture-quality checks; an empty language simply has an empty profile.

Keep these responsibilities in the projection layer:

- Stripping answer keys, adversarial probes, and grading explanations from exercises.
- Removing internal note markers.
- Building language profiles and sanitized language snapshots (`language-snapshot-v2`).
- Building sanitized evaluation artifacts (`evaluation-artifact-v2`).
- Computing visible SHA-256 integrity manifests.

Route handlers should stay focused on auth, validation, mutation, and response status.

## Mutation And Audit Rules

Mutating API routes append `AuditEvent` records when they change persistent state, including language creation/updates, source registration/upload/processing, and extraction-draft accept/reject. Events record actor and role, action, entity type and ID, language ID, timestamp, a human-readable summary, and minimal metadata.

Audit metadata must not include learner answers, answer keys, provider prompts, hidden model traces, API keys, or other private payloads. Persisted app-state reads reject blank audit fields, private payload keys, and secret-looking string values. Audit events must be attributable to a known local user whose role matches the event, and non-null `languageId` values must reference an existing language (`null` is reserved for global events).

Governance records, review policies, review approvals, review dispositions, and elder corrections keep the same validation and one-way state-transition rules as before: governance writes need Elder/lead/admin approval and a parseable effective date; review-disposition ledger writes are de-duplicated per note, disposition, and open status; elder correction review is a one-way transition out of `pending_review`; review-policy thresholds must fit the assigned reviewer list or the assignable reviewer pool; and approvals are unique per language, note, and reviewer.

## Corpus Import Integrity

Corpus imports are role-gated and validated before persistence. The API rejects imports when:

- The language ID is unknown.
- The body is malformed.
- Target text duplicates an existing passage for the language.
- A segmentation surface does not appear in the target text.
- A target-text token is not covered by one or more contiguous segmentation surfaces.
- Target text uses a symbol outside the language's declared phonology inventory. This orthography scan runs only when the language declares an inventory; languages without one skip the check.
- A morpheme is not grounded by the language's lexicon (surface or lemma). Grounding is enforced only when the lexicon is non-empty, so early-stage languages can import freely.
- `consentStatus.use` is not one of the `CONSENT_USE_VALUES` enum values.

Successful imports append the passage, derive a private corpus answer key, and write an audit event with source, morpheme count, tag count, consent-use label, and restriction count. Exercise authoring follows the same pattern: rules are validated against the language's notes and note answer keys, and vocabulary against its lexicon once the lexicon is non-empty.

## Evaluation Harness

`packages/eval` runs deterministic study-loop and scoring logic. The current evaluation categories are:

- Note coverage.
- Note accuracy.
- Evidence accuracy.
- Segmentation accuracy.
- Translation availability.
- Exercise grading.
- Generation policy.

Most categories use a 96% minimum threshold. Generation policy requires 100% because unapproved forms should never enter learner-facing output. Evaluation runs record `fixtureVersion: "workspace-corpus-v1"` because the evaluated corpus is whatever the workspace currently contains.

Persisted evaluation runs must keep nonblank language IDs that reference an existing language, nonblank system version, fixture version, score categories, and summary text, a parseable creation timestamp, and failure lines that match their parent run's language.

## LLM Provider Boundary

LLM provider configuration is server-only. The browser can view readiness status but must never receive provider API keys.

Useful environment variables:

- `ASSINI_LLM_PROVIDER`: `deterministic`, `openai-compatible`, `lm-studio`, `ollama`, or `openai`.
- `ASSINI_LLM_BASE_URL`: OpenAI-compatible base URL.
- `ASSINI_LLM_MODEL`: model name.
- `ASSINI_LLM_API_KEY` or `OPENAI_API_KEY`: server-side key.
- `ASSINI_LLM_TIMEOUT_MS`: positive integer timeout.
- `ASSINI_TRANSCRIBE_BASE_URL`: OpenAI-compatible `/audio/transcriptions` server for audio sources (for example a local whisper server).
- `ASSINI_TRANSCRIBE_MODEL` and `ASSINI_TRANSCRIBE_API_KEY`: transcription model name and optional key.
- `ASSINI_ALLOW_PRIVATE_URLS`: set to `1` or `true` to let URL sources fetch from private/local network addresses (the SSRF guard is skipped). Leave unset in any shared deployment.

`GET /llm/status` reports provider readiness and transcription readiness without exposing keys. Provider errors are sanitized before returning to clients or storing observable session records.

Persisted AI sessions must keep nonblank language and creator IDs, reference an existing language, be created by a known local user whose role is allowed for the session mode, keep nonblank diagnostics and context IDs, and keep parseable timestamps inside the session timeline.
