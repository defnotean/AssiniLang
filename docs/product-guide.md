# Product guide

AssiniLang is a local research console for proving a language-learning AI workflow before any real community language data is introduced.

The workspace starts empty. Users create their own languages, ingest their own raw materials, and review every extracted item before it becomes lexicon, corpus, or grammar data. Consent and provenance metadata travel with every corpus passage.

## Core workflow

1. Create a language. The web console's New language form (at the bottom of the language sidebar) collects name, typology, description, and orthography. A phonology inventory can currently be supplied only through the `POST /languages` API, not the web form.
2. Add raw sources to that language: pasted text, word lists, URLs, or uploaded files including images, audio, and PDF/DOCX documents.
3. Process a source. A local LLM extracts candidate lexemes, corpus passages, and grammar notes; without a configured model, an offline heuristic parses delimited word-list lines and local OCR reads images instead.
4. Review the resulting extraction drafts. Each extraction draft shows its payload, confidence, rationale, and any duplicate badge; accepting commits it, rejecting discards it.
5. Build on the committed data with corpus import, note review, exercise authoring, evaluation, governance, and elder corrections.

## Web console

The Vite React app runs at `http://localhost:5173` during local development. It is organized as a language-focused console: the sidebar selects a language, and section navigation switches between that language's workspaces - Language Profile, Sources & intake, Corpus Browser, Note Review Queue, Learning Lab, Evaluation Dashboard, Governance, and Model Setup.

### Language profile

The profile view presents public linguistic metadata derived from workspace state:

- The declared phonology inventory, when the language has one.
- Public vocabulary from the language's lexicon, each item traceable to its source assets.
- A derived morpheme inventory with corpus-use counts, source passage IDs, glosses, features, and linked lexeme metadata.
- Grammar rules drawn from the language's public notes.
- Counts for corpus passages, notes, exercises, source assets, and pending extraction drafts.

Use this view to understand what forms and rules the selected language currently supports. A new language starts with an empty profile and fills in as sources are processed and drafts are accepted.

### Sources & intake

The intake workspace captures raw materials and turns them into reviewable drafts:

- Register a pasted text, word list, or URL source, or upload a file (PDF, DOCX, plain-text documents, images, or audio; 25 MB cap).
- Process a source to generate extraction drafts. The console processes in the background and polls until the source leaves `processing`, so long sources through a slow local model do not block the page. URL sources are fetched and converted to text server-side; images use a vision-capable model or fall back to local OCR; audio is transcribed through a configured transcription endpoint first.
- Review proposed drafts one by one. Duplicate badges warn when a draft repeats an existing entry ("Duplicate of existing entry"), reuses a form with a different gloss ("Same form, different gloss"), repeats a note topic ("Duplicate topic"), or duplicates another pending draft. Badges are advisory and never block a decision.
- Accepting a lexeme draft adds it to the lexicon; accepting a corpus draft stores the passage with a private answer key and `pending-review` consent status; accepting a grammar-note draft creates a draft note in the normal review queue.
- Failed processing marks the source `failed` with a sanitized error so it can be fixed and retried.

Nothing extracted by a model enters the workspace without an explicit human accept.

### Corpus browser

The corpus browser shows target-language passages, English translations, morphological segmentation, topic tags, source labels, and consent-use labels.

Reviewers can also import passages directly. The import flow captures target text, translation, source label, author/year/license/consent record, unique topic tags, structured morpheme segmentation with complete target-token coverage, and consent restrictions.

The API validates the import before saving. It rejects duplicate target passages, duplicate topic tags, duplicate morpheme feature labels, segmentation surfaces that are not present in the target text, target tokens that are not covered by contiguous segmentation surfaces, consent-use values outside the allowed enum, and malformed payloads. When the language declares a phonology inventory, target text is also scanned against it; when the language has a lexicon, each morpheme must be grounded by a lexicon surface or lemma. Successful imports write audit metadata without storing private reviewer data.

### Note review queue

The review queue shows draft notes beside their status, confidence, evidence count, and examples. Notes come from accepted grammar-note drafts, the deterministic study loop, or earlier review work. Reviewers can:

- Approve notes.
- Contest, reject, defer, or escalate notes with required comments.
- Edit a note explanation through server-side substantive-explanation validation.

Per-language review policies can require assigned reviewers and approval thresholds. When a threshold is greater than one, a note remains `under_review` until enough approvals are recorded. Assigned-reviewer policies bound the threshold to assigned reviewers; open-reviewer policies bound it to the current assignable reviewer pool.

If assignments change mid-review, earlier approvals stay in the audit trail but no longer satisfy quorum unless the reviewer is still eligible under the current policy.

Repeated contested, rejected, deferred, or escalated decisions for the same note and disposition update the existing open work item instead of creating duplicate open ledger entries.

### Learning lab

The Learning Lab previews public learner exercises and submits answers to the API for server-side grading. Public exercise responses omit private answer keys, adversarial probes, and grading explanations.

Reviewers can author compact exercises from the web UI. Exercise authoring is validated server-side against:

- Known language IDs.
- Known grammar-rule IDs from the language's notes, with duplicates rejected after whitespace normalization.
- Known vocabulary forms from the language's lexicon once the lexicon is non-empty, with duplicates rejected after whitespace normalization.
- Non-empty expected answers that are unique after whitespace normalization.
- At least two private adversarial answer probes that do not duplicate expected answers or one another.
- Substantive prompts and grading explanations.

### Evaluation dashboard

The evaluation dashboard shows latest evaluation runs, category scores, regression trends, and failure lines. The local evaluation harness scores these categories:

- Note coverage.
- Note accuracy.
- Evidence accuracy.
- Segmentation accuracy.
- Translation availability.
- Exercise grading.
- Generation-policy checks.

Programmers can export a sanitized evaluation artifact from this view. The export includes latest-run totals, failed/regressed run counts, average latest score, failure lines, trend deltas, and SHA-256 integrity metadata.

### Governance

The governance view exposes local prototype safety rails:

- Consent, access, and generation policy records.
- Review-policy assignment and approval thresholds.
- Review-disposition work records for contested, rejected, deferred, and escalated notes.
- A filtered audit ledger for workspace mutations, including ingestion activity.
- Sanitized single-language snapshot exports with SHA-256 integrity manifests.

These features are prototype scaffolding. They do not replace real community ownership, consent, legal review, or production access control.

### Elder workspace

The Elder workspace shows public note/corpus context and correction records for the selected language. Elders, leads, and admins can submit corrections tied to a note, passage, or custom context. Pending corrections can be accepted or rejected once with reviewer attribution. Accepted note-linked corrections can then be applied through an explicit revised note explanation, which reopens the note for review.

### Model setup

The model setup view reports server-side LLM provider readiness, transcription readiness, and AI session observability. Browser code never receives provider API keys.

Supported provider modes include deterministic fallback, OpenAI-compatible local servers, LM Studio, Ollama, and OpenAI-compatible remote APIs. Audio transcription uses a separate OpenAI-compatible endpoint. Timed-out or failed provider calls are recorded as failed AI sessions with sanitized diagnostics. See the [Configuration Reference](configuration.md) for setup recipes.

## Local user roles

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
- Elder: governance records and elder-correction review/apply flows.
- Reviewer: language creation, source ingestion, extraction-draft review, corpus import, note review, exercise authoring, review policies, and review-disposition workflows.
- Programmer: audit reads, evaluation artifacts, programmer-debug AI sessions, and AI observability. The `GET /observability/neural-map` context graph is reachable with a programmer token through the API but is not surfaced in the browser console.

Lead and admin identities still exist in the local state for backend authorization, persisted review-policy authority, audit integrity, and future production-account design. Review-policy edits from the browser are audited as reviewer activity, while the stored policy updater remains the canonical lead/admin authority required by local database validation.

Prototype auth exists to test workflow permissions. Replace it before production use.

## Export surfaces

Sanitized language snapshots (`language-snapshot-v2`) include public language metadata, the state-derived linguistic profile (phonology, vocabulary, morpheme inventory, grammar rules, and stats), corpus, public review notes, public learner exercises, governance records, and evaluation summaries.

Sanitized evaluation artifacts (`evaluation-artifact-v2`) include latest evaluation runs, latest-vs-previous trend records, failure lines, aggregate gate metadata, and integrity metadata.

Exports intentionally omit:

- Immutable answer keys.
- Learner submissions.
- Learner answers.
- AI sessions.
- Local users.
- Provider prompts.
- Hidden model traces.

Each export includes a SHA-256 integrity manifest over the sanitized payload.
