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

## Data Model

The first implementation should model these entities:

- Language
  - ID, name, typology, description, orthography, status, fixture source.

- CorpusPassage
  - ID, language ID, source, source metadata, target text, translation, segmentation, tags, consent status.

- Note
  - ID, language ID, topic, explanation, examples, evidence passage IDs, confidence, status, dialect scope, reviewer metadata, edit history.

- Exercise
  - ID, language ID, type, prompt, allowed vocabulary/rules, expected answer set, grading rubric.

- EvaluationRun
  - ID, language ID, timestamp, system version, input fixture version, scores, failures, and summary.

The schema should mirror the project plan where possible, even when fields contain synthetic stand-ins.

## Core Workflow

1. Seed synthetic language fixtures.
2. Load corpus, vocabulary, grammar, notes, and exercises into local storage.
3. Run a deterministic study-loop simulation that creates draft notes from grammar and corpus fixtures.
4. Compare generated draft notes against `notes.answer_key.json`.
5. Run exercise grading tests against `exercises.answer_key.json`.
6. Store an `EvaluationRun` with per-category scores and failure details.
7. Display the results in the web UI.

## Web UI Surfaces

### Corpus Browser

Shows synthetic corpus passages for a selected language. Each passage displays target text, translation, segmentation, tags, and provenance metadata.

### Note Review Queue

Shows generated draft notes beside answer-key notes. Users can mark a note as approved, contested, rejected, or edited. This mirrors the reviewer-console concept from the project plan.

### Evaluation Dashboard

Shows latest evaluation scores, failures, and language-by-language comparisons. Failures should be concrete enough that a developer can trace them back to fixture data.

### Learner Exercise Preview

Shows exercises generated from approved notes and lets the user submit answers. The system grades against the answer key and displays the expected explanation.

## Evaluation Categories

The first harness should score:

- Note coverage: expected notes found or missed.
- Note accuracy: generated note content matches the answer key.
- Evidence accuracy: generated notes cite the correct corpus passages.
- Segmentation accuracy: morpheme boundaries and glosses match answer keys.
- Translation accuracy: fixture translations match expected outputs.
- Exercise grading: correct answers accepted and incorrect answers rejected.
- Generation policy: outputs only use allowed vocabulary and approved rules.

Scores should be machine-readable and visible in the web UI.

## Error Handling

- Missing fixture files should fail fast with the exact file path.
- Invalid fixture schema should report the language ID and field path.
- Evaluation failures should be stored as structured records, not just console text.
- UI loading states should distinguish no data, invalid data, and evaluation not yet run.
- Synthetic fixture labels should be visible anywhere language data is displayed.

## Testing Strategy

Testing should start with the fixture and evaluation core:

- Unit tests for fixture schema validation.
- Unit tests for synthetic language rule application.
- Unit tests for note comparison and scoring.
- Unit tests for exercise grading.
- API tests for language, corpus, notes, exercises, and evaluation routes.
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
