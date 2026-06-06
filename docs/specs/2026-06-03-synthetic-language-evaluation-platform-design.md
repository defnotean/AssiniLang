# Synthetic Language Evaluation Platform Design

Date: 2026-06-03
Status: Approved for implementation planning

## Purpose

Build a working, scalable first slice of the First Nations language AI project without using real community language data. The system will use multiple invented languages with detailed corpora, grammar rules, notes, exercises, and answer keys. This lets the team test ingestion, study-loop behavior, note review, learner exercises, and evaluation scoring before any real partnership data enters the system.

The fake languages are explicitly synthetic. They must never be presented as real Indigenous languages, and their data should stay clearly labeled as test fixtures.

## Goals

- Provide a runnable local full-stack scaffold.
- Seed multiple synthetic languages with different linguistic structures.
- Store corpus passages, grammar notes, vocabulary, exercises, answer keys, and evaluation runs.
- Implement an evaluation harness that compares system outputs against gold answer keys.
- Provide a basic web UI for corpus browsing, note review, learner exercise preview, and evaluation dashboards.
- Keep the architecture close to the long-term project plan: corpus and notes are authoritative, model output is downstream, provenance is mandatory, and uncertainty is visible.

## Non-Goals

- No real First Nations or Indigenous language data in this milestone.
- No speech, ASR, TTS, or voice UI.
- No production deployment.
- No fine-tuning.
- No community governance tooling beyond metadata fields and architecture hooks.
- No attempt to generate culturally sensitive content.

## Recommended Approach

Use a full-stack monorepo scaffold with a small local-first implementation:

- `apps/web`: reviewer and learner-facing prototype UI.
- `apps/api`: backend API for languages, corpus, notes, exercises, and evaluations.
- `packages/synthetic-langs`: synthetic language definitions and fixture generation.
- `packages/eval`: evaluation harness and scoring logic.
- `packages/db`: schema, seed helpers, and persistence layer.

The first milestone should use lightweight local persistence so it works immediately on a developer machine. The interfaces should be designed so the storage layer can later move to Postgres and pgvector without rewriting the app surfaces.

## Alternative Approaches Considered

### CLI-Only Harness

This would be fastest and safest for evaluation logic, but it would not exercise the reviewer console, learner workflows, or surface-level data flow from the project plan.

### UI-First Prototype

This would create something visually useful quickly, but it risks treating the web app as the product before the corpus, notes, and evaluation contracts are stable.

### Full-Stack Scaffold With Local-First Milestone

This is the selected approach. It gives the project a real architecture while keeping the first build small, testable, and runnable.

## Synthetic Language Fixture Design

Create four invented languages:

1. Agglutinative language
   - Words combine stems with transparent suffix chains.
   - Useful for testing morphology segmentation and rule composition.

2. Isolating language
   - Grammar is mostly expressed through word order and particles.
   - Useful for testing syntax notes and learner exercises without heavy inflection.

3. Fusional language
   - Single endings encode multiple grammatical features.
   - Useful for testing ambiguity and note confidence.

4. Polysynthetic-lite language
   - Verb-centered forms combine subject, object, tense, and lexical roots.
   - Useful for stress-testing segmentation, generation gates, and long-form explanations.

Each language fixture includes:

- `language.json`: metadata, typology, writing system, and generation policy.
- `vocabulary.json`: lexemes, glosses, parts of speech, and feature tags.
- `grammar.json`: formalized rules, examples, exceptions, and confidence levels.
- `corpus.jsonl`: target-language passages, translations, segmentation, topic tags, provenance, and synthetic consent metadata.
- `notes.answer_key.json`: expected approved grammar and vocabulary notes.
- `exercises.answer_key.json`: expected exercise prompts, valid answers, and grading explanations.

The implemented baseline should keep at least ten corpus passages, five grammar rules, five note answer keys, and five learner exercises per synthetic language. Each language should also include at least two exercise types so the grading workflow is not trained only on a single task shape.

## Data Model

The first implementation should model these entities:

- Language
  - ID, name, typology, description, orthography, status, fixture source.

- DialectVariant
  - ID, language ID by fixture ownership, public name, region label, phonology notes, lexical notes, grammar notes, and standard-vs-variant example phrases.

- CorpusPassage
  - ID, language ID, source, source metadata, target text, translation, segmentation, tags, consent status.

- Note
  - ID, language ID, topic, explanation, examples, evidence passage IDs, confidence, status, dialect scope, reviewer metadata, edit history.

- Exercise
  - ID, language ID, type, prompt, allowed vocabulary/rules, expected answer set, private adversarial answer probes, grading rubric.

- EvaluationRun
  - ID, language ID, timestamp, system version, input fixture version, scores, failures, and summary.

- GovernanceRecord
  - ID, language ID, policy type, policy content, effective date, and approving actor.

- ReviewPolicy
  - ID, language ID, assigned reviewer IDs, approval threshold, assigned-reviewer requirement, updated timestamp, and updating actor.

- ReviewApproval
  - ID, language ID, note ID, reviewer ID, and approval timestamp.

- ReviewDisposition
  - ID, language ID, note ID, disposition status, work status, reason, assignee, due date, opener, resolution actor, resolution timestamp, and resolution summary.

- AuditEvent
  - ID, timestamp, actor ID, actor role, action, entity type, entity ID, language ID, summary, and minimal non-secret metadata.

The schema should mirror the project plan where possible, even when fields contain synthetic stand-ins.

## Core Workflow

1. Seed synthetic language fixtures.
2. Load corpus, vocabulary, dialect variants, grammar, notes, and exercises into local storage.
3. Run a deterministic study-loop simulation that creates draft notes from grammar and corpus fixtures.
4. Compare generated draft notes against `notes.answer_key.json`.
5. Run exercise grading tests against `exercises.answer_key.json`.
6. Store an `EvaluationRun` with per-category scores and failure details.
7. Display the results in the web UI.
8. Export sanitized evaluation artifacts with latest-run scores, latest-vs-previous trend deltas, aggregate gate status, failure lines, and a SHA-256 integrity manifest.
9. Export sanitized single-language review snapshots with public linguistic profile metadata, including dialect variants, and a SHA-256 integrity manifest for authorized reviewers without exposing answer keys or learner submissions.
10. Submit, review, and explicitly apply elder correction records, preserving accepted/rejected audit attribution and note edit history.
11. Enforce per-language review policies so assigned reviewer approvals must meet the configured threshold before notes move to `approved`.
12. Open assigned, due-date-bearing review disposition records for contested, rejected, deferred, and escalated notes; resolve them back into `under_review` with an audit trail.
13. Append role-gated audit events for persisted data mutations without storing learner answers, provider prompts, answer keys, or hidden model traces.
14. Let authorized reviewers, leads, and admins author synthetic exercises through server-side rule, vocabulary, answer, and at-least-two adversarial-probe validation while keeping answer keys private in public responses.
15. Let authorized reviewers, leads, and admins import synthetic corpus passages through provenance, synthetic-consent, and segmentation validation with auditable import metadata.

## Web UI Surfaces

### Language Profile

Shows public phonology, dialect variants, paradigm tables, grammar rules, vocabulary, and fixture counts for the selected synthetic language. Dialect variants should show public region labels, phonology notes, lexical notes, grammar notes, and standard-vs-variant examples without exposing answer keys.

### Corpus Browser

Shows synthetic corpus passages for a selected language. Each passage displays target text, translation, segmentation, tags, and provenance metadata. Authorized reviewers can import new synthetic passages through the browser with source metadata, synthetic consent status, topic tags, and structured morpheme segmentation that is validated by the API before persistence.

### Note Review Queue

Shows generated draft notes beside answer-key notes. Users can revise the selected note explanation after server-side substantive-explanation validation and mark a note as approved, contested, rejected, deferred, or escalated. This mirrors the reviewer-console concept from the project plan.

Contested, rejected, deferred, and escalated notes must include a reviewer comment explaining the reason for the disposition. The API should reject disposition writes without a substantive comment and preserve the previous note state. Disposition writes should create trackable work records with an assignee and optional due date; the assignee, leads, and admins can resolve those records and return the note to `under_review`. The Governance UI should expose the disposition ledger with reason, assignee, due date, resolution summary entry, and resolved attribution.

### Evaluation Dashboard

Shows latest evaluation scores, latest-vs-previous regression trends, failures, and language-by-language comparisons. Failures should be concrete enough that a developer can trace them back to fixture data. The dashboard exposes a sanitized evaluation artifact download with latest runs, aggregate pass/fail metadata, trend counters, per-category score deltas, failure lines, and a visible integrity hash prefix, without answer keys, learner submissions, learner answers, AI sessions, or local users.

### Learner Exercise Preview

Shows exercises generated from approved notes and lets the user submit answers. The system grades against the answer key and displays the expected explanation. The Learning Lab also exposes compact reviewer authoring controls for creating validated synthetic exercises without returning private answer-key fields to the browser.

### Governance And Snapshot Export

Shows local synthetic governance policy records, lets authorized prototype users add policy records, lets leads maintain assigned reviewer IDs and approval thresholds, exposes the review-disposition work ledger for resolution, exposes a filtered role-gated audit ledger for mutation traceability, and exposes a sanitized single-language JSON snapshot download for review handoff. The snapshot includes public phonology, dialect variants, paradigm tables, vocabulary, grammar rules, corpus, review notes, exercises, governance records, evaluation summaries, and a visible integrity hash prefix. The snapshot download must never include answer keys, learner submissions, learner answers, AI sessions, or local users.

### Elder Workspace

Shows public note/corpus context and the submitted correction ledger for one synthetic language. Elders can submit correction records tied to a note, passage, or custom context. Elders, leads, and admins can accept or reject pending corrections, and each review transition records `reviewedBy` plus `reviewedAt`. Accepted corrections linked to a note can then be applied only through an explicit revised explanation; applying a correction moves the correction to `applied`, sets the note back to `under_review`, and appends a note `applied_correction` edit-history entry.

## Evaluation Categories

The first harness should score:

- Note coverage: expected notes found or missed.
- Note accuracy: generated note content matches the answer key.
- Evidence accuracy: generated notes cite the correct corpus passages.
- Segmentation accuracy: morpheme boundaries and glosses match answer keys.
- Translation accuracy: fixture translations match expected outputs.
- Exercise grading: correct answers accepted, deterministic invalid answers rejected, and curated adversarial answer probes rejected.
- Generation policy: outputs only use allowed vocabulary and approved rules.

Scores should be machine-readable and visible in the web UI. The evaluation gate should fail when structured failures exist or when any category drops below its required floor. Most categories use a 96% minimum during the synthetic milestone; generation-policy checks require 100% because unapproved forms should never enter learner-facing outputs.

## Error Handling

- Missing fixture files should fail fast with the exact file path.
- Invalid fixture schema should report the language ID and field path.
- Invalid fixture cross-references should fail before seeding with actionable diagnostics for duplicate IDs, duplicate or empty dialect variant records, missing evidence passages, duplicate corpus topic tags, duplicate morpheme feature labels, target tokens not covered by corpus segmentation, symbols outside a language phonology inventory, missing or duplicate exercise rules, unknown or duplicate allowed vocabulary, duplicate expected exercise answers, invalid particle answers, target-language answers not present in the corpus, and adversarial exercise probes that duplicate accepted answers or one another.
- Evaluation failures and threshold breaches should be stored or surfaced as traceable records, not just console text.
- UI loading states should distinguish no data, invalid data, and evaluation not yet run.
- Synthetic fixture labels should be visible anywhere language data is displayed.
- Governance writes should be role-gated and reject unknown language IDs without mutating stored policy records.
- Review-policy writes should be role-gated to leads/admins, reject unknown reviewers or impossible approval thresholds, and keep notes `under_review` until enough assigned approvals exist.
- Note explanation edits should reject underspecified text before mutating note status, reviewer metadata, or edit history.
- Review-disposition writes should validate assignees and due dates, preserve a work ledger, restrict resolution to assignees/leads/admins, reopen linked notes for review, and audit both creation and resolution.
- Audit-event reads should be role-gated to operational leads/admins/programmers, support language filtering, reject unknown language filters, and omit learner answers, provider prompts, answer keys, and hidden model traces.
- Review snapshot exports should be role-gated, include public linguistic profile metadata with dialect variants and an integrity manifest with SHA-256 content hash plus redaction policy, return unknown-language errors, and omit answer keys, adversarial exercise probes, learner submissions, learner answers, AI sessions, and local user records.
- Evaluation artifact exports should be role-gated, include latest-run aggregate metadata, latest-vs-previous trend records, failure lines, and an integrity manifest with SHA-256 content hash plus redaction policy, and omit answer keys, learner submissions, learner answers, AI sessions, and local user records.
- Elder correction review should be role-gated, reject learners/reviewers/programmers, preserve notes during accepted/rejected transitions, and persist reviewer attribution.
- Elder correction application should require an accepted note-linked correction, reject empty revised explanations, update the linked public note with audit history, and move the correction to `applied`.
- Exercise authoring should be role-gated, reject unknown language/rule/vocabulary references, duplicate allowed rules or vocabulary, fewer than two adversarial probes, duplicate expected answers, and duplicate adversarial probes before mutation, store answer keys server-side, return only public exercise fields, and audit creation without logging expected-answer text.
- Corpus imports should be role-gated, reject duplicate target passages, duplicate topic tags, duplicate morpheme feature labels, target text outside the selected language phonology inventory, segmentation surfaces not present in the target text, target tokens not covered by contiguous segmentation surfaces, and morphemes not grounded by the selected language vocabulary surface or lemma before mutation, require synthetic-only consent metadata, and audit import provenance without storing private review data.

## Testing Strategy

Testing should start with the fixture and evaluation core:

- Unit tests for fixture schema validation.
- Unit tests for required public dialect variant metadata and diagnostics.
- Unit tests for required private adversarial exercise probes and diagnostics.
- Unit tests for synthetic language rule application.
- Unit tests for note comparison and scoring.
- Unit tests for evaluation gate failures from explicit records and score thresholds.
- Unit tests for exercise grading.
- API tests for language, corpus, notes, exercises, and evaluation routes.
- API tests for role-gated governance policy creation and invalid governance writes.
- API tests for review-policy assignment, threshold enforcement, unassigned reviewer rejection, and audit metadata.
- API tests for review-disposition assignment, due dates, assignee-only resolution, note reopening, and audit metadata.
- API tests for role-gated audit-event recording and filtered reads.
- API tests for sanitized review snapshot exports, exported linguistic metadata, integrity manifests, and forbidden export attempts.
- API tests for sanitized evaluation artifact exports, integrity manifests, and forbidden export attempts.
- Web smoke tests for the corpus browser, note review queue, dashboard, and learner exercise preview.

The first milestone is complete only when one command can seed fixtures, run evaluations, and start the local app.

## Scale Path

After the synthetic testbed works, scale in this order:

1. Add more fixture languages and harder grammar cases.
2. Swap local persistence for Postgres.
3. Add pgvector retrieval.
4. Replace deterministic study-loop simulation with model-assisted note drafting.
5. Add access controls and governance workflows.
6. Integrate real community-owned data only after partnership, license, and consent processes are complete.

## Acceptance Criteria

- Repository contains the monorepo scaffold.
- At least four synthetic languages exist with corpora and answer keys.
- Each synthetic language has at least ten corpus passages, five grammar-derived note answer keys, and five learner exercise answer keys.
- Evaluation harness runs from the command line.
- Web UI displays corpus, note review, evaluation, and learner exercise views.
- Evaluation results are persisted locally.
- All synthetic data is clearly labeled as fake test data.
- Tests cover fixture loading, scoring, exercise grading, and API routes.
- The setup is documented with a single local run command.

## Spec Self-Review

- Completion scan: no unresolved markers remain.
- Scope check: this is one coherent first milestone, not the entire long-term language AI system.
- Ambiguity check: persistence starts local-first; Postgres and pgvector are later scale steps.
- Governance check: real First Nations language data is explicitly excluded from this milestone.
