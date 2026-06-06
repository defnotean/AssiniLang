# Product Guide

AssiniLang is a local research console for proving a language-learning AI workflow with invented synthetic languages before any real community language data is introduced.

The current milestone is built around four fictional languages:

- `Avenik`: agglutinative suffix chains.
- `Solari`: isolating word order and particles.
- `Velari`: fusional endings.
- `Ketharu`: polysynthetic-lite verb forms.

Each language has public corpus passages, grammar notes, learner exercises, answer keys, vocabulary, phonology, paradigms, dialect variants, and evaluation records.

## Web Console

The Vite React app runs at `http://localhost:5173` during local development. It is organized as a language-focused console with section navigation for the selected synthetic language.

### Language Profile

The profile view presents public linguistic metadata:

- Phonology and phonotactic notes.
- Grammar-rule inventory.
- Public vocabulary.
- A derived morpheme inventory with corpus-use counts, source passage IDs, glosses, features, and linked vocabulary metadata.
- Paradigm tables.
- Dialect variants with region labels, notes, and standard-vs-variant examples.
- Fixture counts for corpus, notes, exercises, and profile structures.

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

Per-language review policies can require assigned reviewers and approval thresholds. When a threshold is greater than one, a note remains `under_review` until enough assigned reviewers approve it.

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

### Governance

The governance view exposes local prototype safety rails:

- Synthetic consent, access, and generation policy records.
- Review-policy assignment and approval thresholds.
- Review-disposition work records for contested, rejected, deferred, and escalated notes.
- A filtered audit ledger for synthetic data mutations.
- Sanitized single-language snapshot exports with SHA-256 integrity manifests.

These features are prototype scaffolding. They do not replace real community ownership, consent, legal review, or production access control.

### Elder Workspace

The Elder workspace shows public note/corpus context and correction records for the selected language. Elders, leads, and admins can submit corrections tied to a note, passage, or custom context. Corrections can be accepted or rejected with reviewer attribution. Accepted note-linked corrections can then be applied through an explicit revised note explanation, which reopens the note for review.

### Model Setup

The model setup view reports server-side LLM provider readiness and AI session observability. Browser code never receives provider API keys.

Supported provider modes include deterministic fallback, OpenAI-compatible local servers, LM Studio, Ollama, and OpenAI-compatible remote APIs. Timed-out or failed provider calls are recorded as failed AI sessions with sanitized diagnostics.

## Local User Roles

The local prototype includes role-aware users for:

- Learners.
- Elders.
- Reviewers.
- Leads.
- Programmers.
- Admins.

Prototype auth exists to test workflow permissions. Replace it before production use.

## Export Surfaces

Sanitized language snapshots include public language metadata, linguistic profile data, corpus, public review notes, public learner exercises, governance records, and evaluation summaries.

Exports intentionally omit:

- Immutable answer keys.
- Learner submissions.
- Learner answers.
- AI sessions.
- Local users.
- Provider prompts.
- Hidden model traces.

Each export includes a SHA-256 integrity manifest over the sanitized payload.
