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
- Public vocabulary with at least 24 lexemes, particles, endings, prefixes, or other usable forms.
- At least 12 corpus passages with translation and morpheme segmentation.
- At least 6 grammar rules.
- At least 6 note answer keys.
- At least 6 learner exercise answer keys.
- At least two private adversarial exercise probes.
- Paradigm tables.
- Dialect variants.

The shared `SYNTHETIC_FIXTURE_MINIMUMS` export in `packages/synthetic-langs/src/validation.ts` is the source of truth for the current fixture depth floor; tests and docs should reference or mirror that contract when the baseline changes. Public language profiles and sanitized snapshots derive `fixtureQuality` checks from that same floor so reviewers can compare actual public profile depth against the current minimums without exposing private answer-key content.

Fixture loading validates cross-references, linguistic consistency, and fixture depth. It rejects broken evidence IDs, duplicate IDs, duplicate vocabulary IDs or forms, duplicate vocabulary tags, empty dialect labels, undersized phonology inventories, missing stress or syllable-template metadata, lexicons below 24 public vocabulary items, corpus/rule/note/exercise/paradigm/dialect sets below the synthetic milestone floor, grammar rules without note or learner-exercise coverage, mismatched language IDs, public forms outside the phonology inventory, corpus tokens that are not covered by segmentation, corpus morphemes not grounded by vocabulary surface or lemma, duplicate corpus topic tags, duplicate morpheme feature labels, missing exercise rules, unknown or duplicate allowed exercise vocabulary and rules, duplicate expected exercise answers, invalid particle answers, target-language answers absent from the corpus, adversarial probes that duplicate accepted answers or one another, note evidence-count drift, and note examples that no longer match their cited corpus passage.

Validation rules live in `packages/synthetic-langs/src/validation.ts`; seed-state cloning and answer-key materialization live in `packages/synthetic-langs/src/loader.ts`.
The shared orthography scanner is exported so fixture validation and live API imports use the same phonology-inventory rules.

## Local Persistence

The generated local database lives at `data/local-db.json`. `JsonStore` writes through a temporary file and rename so normal writes are atomic.

Persisted top-level records must keep stable nonblank unique IDs inside each app-state collection. The schema rejects duplicate IDs for languages, corpus passages, notes, exercises, submissions, evaluations, governance records, users, AI sessions, elder corrections, audit events, review policies, review approvals, and review dispositions; corpus answer keys are unique by nonblank source passage ID and must point at an existing same-language corpus passage. Persisted language records must also keep public names, descriptions, orthography labels, and fixture-source labels nonblank so corrupted local JSON cannot publish empty language catalog entries.

Seeded local databases include six local user identities used by review policies, audit attribution, and backend authorization: learner, Elder, reviewer, lead, programmer, and admin. The web console opens HTTP-only prototype sessions only for learner, Elder, reviewer, and programmer users; lead/admin identities remain server-token authorities for persisted policy ownership and administrative workflows. The API still falls back to the same shared prototype-user list when reading older local databases with an empty `users` array. Persisted user records must keep nonblank IDs and names, and optional avatar URLs must be nonblank when present, so local auth, review assignment, and audit attribution do not depend on empty user identities.

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
- `exerciseSubmissions` keep learner answers and actor IDs server-side; public submission views redact both fields.
- `corpusAnswerKeys` preserve expected corpus segmentation for evaluation.

This matters because the system must not evaluate itself against whatever a reviewer last edited.

Seeded fixtures derive corpus answer keys from each seeded corpus passage. Live corpus imports do the same after validation, storing the imported passage publicly while adding a private answer key for evaluation. Persisted app-state reads reject corpus answer keys that reference missing passages, carry a different language ID than the passage they key, contain blank target text, translation, morpheme surface, lemma, gloss, or feature labels, duplicate morpheme feature labels after whitespace normalization, or lose their own target-text segmentation coverage.

Persisted corpus passages must keep nonblank language IDs that reference existing synthetic languages; keep nonblank source labels, source author, source license, source consent record, target text, translation, consent restrictions, morpheme surfaces, morpheme lemmas, and morpheme glosses; keep at least one nonblank topic tag; keep duplicate-free topic tags and morpheme feature lists after whitespace normalization; use segmentation surfaces that appear in the target text; and cover every target-text token with one or more contiguous segmentation surfaces. Persisted corpus answer keys must keep nonblank passage and language IDs tied to existing same-language corpus passages. The persisted DB layer does not check phonology inventory or vocabulary grounding because those depend on synthetic fixture metadata; those checks stay in `packages/synthetic-langs` and the live corpus import route.

Persisted notes and note answer keys must keep nonblank language IDs that reference existing synthetic languages. Their topic, explanation, and dialect-scope text must remain nonblank; their evidence counts must match their evidence passage ID lists; reviewer and edit-history timestamps must remain parseable when present; reviewer and edit-history actor IDs must be nonblank review-capable local users or reserved deterministic system actors; reviewer comments and edit-history summaries must remain nonblank; edit-history actions must stay inside the known note timeline vocabulary (`created`, `drafted`, `migrated`, `reviewed`, `disposition_resolved`, and `applied_correction`); evidence passage IDs must be nonblank and resolve to same-language corpus passages; and note examples must cite existing same-language corpus passages through nonblank passage IDs with matching target text and translation. These checks keep reviewer drafts, immutable note answer keys, public snapshots, and evaluation inputs anchored to real local corpus evidence after manual JSON edits or legacy migration.

Persisted exercises must keep nonblank language IDs that reference an existing synthetic language, keep prompt and private grading explanation text nonblank, keep nonblank duplicate-free allowed rule IDs, allowed vocabulary, expected answers, and adversarial probes after whitespace normalization, require nonblank adversarial reasons, retain at least two adversarial probes, avoid adversarial answers that duplicate expected answers, keep translate-to-target expected answers present in same-language corpus text, and keep choose-particle expected answers inside the exercise's allowed vocabulary. Fixture-level rule and vocabulary existence checks stay in `packages/synthetic-langs` and the live API authoring route because the DB package deliberately has no dependency on fixture metadata.

Persisted exercise submissions must keep nonblank exercise, language, and learner IDs, reference an existing exercise, match that exercise's language ID, keep nonblank private answer and grading-explanation text, keep a parseable submission timestamp, and use a known local actor with a role allowed to submit answers. This prevents manually edited local JSON from creating orphaned learner history or leaking malformed records through public submission views.

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

Audit metadata must not include learner answers, answer keys, provider prompts, hidden model traces, API keys, or other private payloads. Persisted app-state reads reject blank audit actions, entity IDs, and summaries, audit metadata with private payload keys such as learner answers, expected answers, answer keys, grading explanations, provider prompts, hidden chain-of-thought, API keys, tokens, or secrets; they also reject secret-looking string values.

Persisted audit events must keep a parseable `at` timestamp, be attributable to a nonblank known local user, and store an actor role that matches that user. Non-null audit `languageId` values must be nonblank and reference an existing synthetic language; `null` is reserved for global events. These checks keep restored JSON from misrepresenting when or who performed a mutation or attaching events to non-existent languages.

Governance records are local synthetic policy records, not production consent infrastructure. API writes and persisted restores require nonblank policy content and a parseable `effectiveDate`; persisted records must also keep nonblank language IDs that reference an existing synthetic language and be approved by a nonblank known Elder, lead, or admin user. This keeps local JSON restores aligned with the API mutation boundary and prevents orphaned, empty, misdated, or misattributed policy records from appearing in exports.

Review-disposition ledger writes are de-duplicated per note, disposition, and open status. Reopening the same unresolved disposition updates the existing work record's reason, assignee, and due date while preserving original opened attribution and writing a new audit event for the update. Persisted disposition records must keep nonblank language and note IDs, reference an existing note in the same language, keep open work attached to notes currently in a disposition status, use nonblank assignable local users for assignee/opener/resolver fields, keep nonblank reason and resolution text, keep parseable `dueAt`, `openedAt`, and non-null `resolvedAt` fields, prevent resolved timestamps from predating opened timestamps, keep resolution fields empty while open, and include all resolution fields once resolved.

Elder correction review is a one-way transition out of `pending_review`. Accepted, rejected, and applied corrections cannot be re-reviewed, which preserves reviewer attribution and keeps later note edits auditable. Persisted correction records must keep nonblank language IDs that reference an existing synthetic language, must keep nonblank same-language note or corpus targets when those IDs are present, keep correction text, rationale, and custom context text nonblank, use nonblank Elders/leads/admins for proposer and reviewer attribution, keep parseable proposal/review timestamps in chronological order, keep pending corrections free of review attribution, and include reviewer attribution once accepted, rejected, or applied. Applied corrections must remain note-linked because applying a correction mutates a note explanation and reopens that note for review.

Review-policy records are validated both at the API mutation boundary and at the persisted app-state boundary. Assigned reviewers must be nonblank, unique, known local users, and in an assignable review role; approval thresholds must fit either the assigned reviewer list or the open assignable reviewer pool. Persisted policies are unique per synthetic language, must keep nonblank language IDs that reference an existing language, must keep a parseable update timestamp, and must use a nonblank updater ID for a known lead/admin user, except for `system-seed`, which is reserved for initial fixture policy generation.

Review-approval records are unique per language, note, and reviewer. The local database schema rejects duplicate approval tuples, approvals with blank language, note, or reviewer IDs, approvals with unparseable approval timestamps, approvals for missing notes, approval language mismatches, approvals attached to notes outside `under_review` or `approved`, unknown reviewer IDs, and approvals from users outside assignable review roles so quorum counts cannot drift from malformed persisted records.

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

Successful imports append the passage, derive a private corpus answer key from the validated text/translation/segmentation, and write an audit event with source, morpheme count, tag count, consent-use label, and restriction count.

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

Persisted evaluation runs must keep nonblank language IDs that reference an existing synthetic language; keep nonblank system version, fixture version, score category, and summary text; keep a parseable creation timestamp; and each failure line must use a nonblank language ID matching the run it belongs to with a nonblank category, item ID, and diagnostic message. This keeps restored evaluation history traceable by language and prevents malformed local JSON from polluting dashboards or sanitized evaluation artifacts.

## LLM Provider Boundary

LLM provider configuration is server-only. The browser can view readiness status but must never receive provider API keys.

Useful environment variables:

- `ASSINI_LLM_PROVIDER`: `deterministic`, `openai-compatible`, `lm-studio`, `ollama`, or `openai`.
- `ASSINI_LLM_BASE_URL`: OpenAI-compatible base URL.
- `ASSINI_LLM_MODEL`: model name.
- `ASSINI_LLM_API_KEY` or `OPENAI_API_KEY`: server-side key.
- `ASSINI_LLM_TIMEOUT_MS`: positive integer timeout.

Provider errors are sanitized before returning to clients or storing observable session records.

Persisted AI sessions must keep nonblank language and creator IDs, reference an existing synthetic language, be created by a known local user whose role is allowed for the session mode, keep nonblank thinking summaries, message content, trace labels, trace summaries, trace warnings, privacy redaction labels, and note/corpus context IDs, keep parseable session and message timestamps inside the session timeline, and use same-language note and corpus context IDs. This keeps restored observability records aligned with the live AI-session route and prevents malformed JSON from leaking empty diagnostics or impossible context graphs into model setup and neural-map views.
