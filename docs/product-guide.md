# Product Guide

AssiniLang is a local research console for proving a language-learning AI workflow with invented synthetic languages before any real community language data is introduced.

The current milestone is built around four fictional languages:

- `Avenik`: agglutinative suffix chains.
- `Solari`: isolating word order and particles.
- `Velari`: fusional endings.
- `Ketharu`: polysynthetic-lite verb forms.

Each language has at least 24 public vocabulary items, 3 semantic domains with vocabulary and corpus evidence, 12 corpus passages, 6 grammar notes, 6 learner exercises, answer keys, phonology, paradigms, dialect variants with evidence-backed history timelines, 3 discourse examples, 2 teaching sequences, and evaluation records.

## Web Console

The Vite React app runs at `http://localhost:5173` during local development. It is organized as a language-focused console with section navigation for the selected synthetic language.

### Language Profile

The profile view presents public linguistic metadata:

- Phonology and phonotactic notes.
- Grammar-rule inventory.
- Public vocabulary.
- Semantic domains that group core vocabulary, usage notes, and corpus evidence into teachable fields.
- A derived morpheme inventory with corpus-use counts, source passage IDs, glosses, features, and linked vocabulary metadata.
- Paradigm tables.
- Dialect variants with region labels, notes, evidence-backed history timelines, and standard-vs-variant examples.
- Discourse examples that show teaching-turn openings, repairs, choices, closures, or review cues with target text, translation, usage context, and pragmatic notes.
- Teaching sequences that connect grammar rules, corpus passages, and public learner exercises into intro, practice, or review paths with step-by-step prompts.
- Fixture counts for corpus, notes, exercises, and profile structures.
- The synthetic fixture quality floor from `SYNTHETIC_FIXTURE_MINIMUMS`, shown as the minimum expected vocabulary, semantic-domain, corpus, grammar, note, exercise, paradigm, dialect, dialect-history, discourse-example, and teaching-sequence coverage for every synthetic language.
- Actual-vs-minimum fixture quality checks, so reviewers can see whether each public profile currently meets the synthetic depth baseline.

Use this view to understand what forms and rules the selected synthetic language is allowed to use.

### Corpus Browser

The corpus browser shows target-language passages, English translations, morphological segmentation, topic tags, source labels, and consent-use labels.

Reviewers can also import new synthetic passages from the browser. The import flow captures:

- Target text.
- English translation.
- Source label.
- Author, year, license, and consent record.
- Unique topic tags.
- Structured morpheme segmentation with unique feature labels per morpheme and complete target-token coverage.
- Synthetic-only access restrictions.

The API validates the import before saving. It rejects duplicate target passages, duplicate topic tags, duplicate morpheme feature labels, target text with symbols outside the selected language phonology inventory, segmentation surfaces that are not present in the target text, target tokens that are not covered by contiguous segmentation surfaces, morphemes that are not grounded by the selected language vocabulary surface or lemma, invalid synthetic consent metadata, and malformed payloads. Successful imports write audit metadata without storing private reviewer data.

### Note Review Queue

The review queue shows generated draft notes beside their status, confidence, evidence count, and examples. Reviewers can:

- Approve notes.
- Contest, reject, defer, or escalate notes with required comments.
- Edit a note explanation through server-side substantive-explanation validation.

Per-language review policies can require assigned reviewers and approval thresholds. When a threshold is greater than one, a note remains `under_review` until enough approvals are recorded. Assigned-reviewer policies bound the threshold to assigned reviewers; open-reviewer policies bound it to the current assignable reviewer pool.

If assignments change mid-review, earlier approvals stay in the audit trail but no longer satisfy quorum unless the reviewer is still eligible under the current policy.

Repeated contested, rejected, deferred, or escalated decisions for the same note and disposition update the existing open work item instead of creating duplicate open ledger entries.

### Learning Lab

The Learning Lab previews public learner exercises and submits answers to the API for server-side grading. Public exercise responses omit private answer keys, adversarial probes, and grading explanations.

Reviewers can author compact synthetic exercises from the web UI. Exercise authoring is validated server-side against:

- Known language IDs.
- Known grammar-rule IDs, with duplicates rejected after whitespace normalization.
- Known vocabulary forms, with duplicates rejected after whitespace normalization.
- Non-empty expected answers that are unique after whitespace normalization.
- At least two private adversarial answer probes that do not duplicate expected answers or one another after whitespace normalization.
- Substantive grading explanations.

### Evaluation Dashboard

The evaluation dashboard shows latest synthetic evaluation runs, category scores, regression trends, and failure lines. The local evaluation harness currently scores these categories:

- Note coverage.
- Note accuracy.
- Evidence accuracy.
- Segmentation accuracy.
- Translation availability.
- Exercise grading.
- Generation-policy checks.

The seeded baseline currently scores all four synthetic languages at 100%.

Programmers can export a sanitized evaluation artifact from this view. The export includes latest-run totals, failed/regressed run counts, average latest score, failure lines, trend deltas, SHA-256 integrity metadata, and aggregate fixture-quality readiness across the synthetic language set. The web confirmation includes the fixture-check pass count so reviewers can see baseline data depth without opening the JSON first.

### Governance

The governance view exposes local prototype safety rails:

- Synthetic consent, access, and generation policy records.
- Review-policy assignment and approval thresholds.
- Review-disposition work records for contested, rejected, deferred, and escalated notes.
- A filtered audit ledger for synthetic data mutations.
- Sanitized single-language snapshot exports with SHA-256 integrity manifests.

These features are prototype scaffolding. They do not replace real community ownership, consent, legal review, or production access control.

### Elder Workspace

The Elder workspace shows public note/corpus context and correction records for the selected language. Elders, leads, and admins can submit corrections tied to a note, passage, or custom context. Pending corrections can be accepted or rejected once with reviewer attribution. Accepted note-linked corrections can then be applied through an explicit revised note explanation, which reopens the note for review.

### Model Setup

The model setup view reports server-side LLM provider readiness and AI session observability. Browser code never receives provider API keys.

Supported provider modes include deterministic fallback, OpenAI-compatible local servers, LM Studio, Ollama, and OpenAI-compatible remote APIs. Timed-out or failed provider calls are recorded as failed AI sessions with sanitized diagnostics.

## Local User Roles

The local prototype keeps six role-aware identities in the local database:

- Learners.
- Elders.
- Reviewers.
- Leads.
- Programmers.
- Admins.

The browser prototype flow is leadless on purpose. It opens HTTP-only local sessions only for learner, Elder, reviewer, and programmer actors, then calls the API with the narrowest actor that can exercise each workflow.

The browser actor mapping is:

- Learner: learner exercise submissions and learner-practice AI sessions.
- Elder: synthetic governance records and elder-correction review/apply flows.
- Reviewer: corpus import, note review, exercise authoring, review policies, and review-disposition workflows.
- Programmer: audit reads, evaluation artifacts, programmer-debug AI sessions, AI observability, and neural-map inspection.

Lead and admin identities still exist in the local state for backend authorization, persisted review-policy authority, audit integrity, and future production-account design. Review-policy edits from the browser are audited as reviewer activity, while the stored policy updater remains the canonical lead/admin authority required by local database validation.

Prototype auth exists to test workflow permissions. Replace it before production use.

## Export Surfaces

Sanitized language snapshots include public language metadata, linguistic profile data, semantic domains, dialect histories, discourse examples, teaching sequences, the same synthetic fixture quality floor and actual-vs-minimum quality checks shown in the profile view, corpus, public review notes, public learner exercises, governance records, and evaluation summaries. The web download summary includes semantic-domain, discourse-example, teaching-sequence, and fixture-quality pass counts so reviewers can see baseline readiness before opening the JSON artifact.

Sanitized evaluation artifacts include latest evaluation runs, latest-vs-previous trend records, failure lines, aggregate gate metadata, aggregate fixture-quality readiness, and integrity metadata. They summarize fixture checks across all exported synthetic languages so the artifact can be reviewed as both an evaluation-health and data-depth record.

Exports intentionally omit:

- Immutable answer keys.
- Learner submissions.
- Learner answers.
- AI sessions.
- Local users.
- Provider prompts.
- Hidden model traces.

Each export includes a SHA-256 integrity manifest over the sanitized payload.
