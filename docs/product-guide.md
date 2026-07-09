# Product guide

AssiniLang is a local research console for proving a language-learning AI workflow before any real community language data is introduced.

The workspace starts empty. Users create their own languages, ingest their own raw materials, and review every extracted item before it becomes lexicon, corpus, or grammar data. Consent and provenance metadata travel with every corpus passage. Language-scoped views (Build, Practice, Chat, and related panels) show a next-step empty state — select or create a language via **New language** in the sidebar — until a workspace language exists.

## Core workflow

1. Create a language. The web console's New language form (at the bottom of the language sidebar) collects name, typology, description, and orthography. A phonology inventory can currently be supplied only through the `POST /languages` API, not the web form.
2. Add raw sources to that language: pasted text, word lists, URLs, local Obsidian Markdown vaults, or uploaded files including images, audio, and PDF/DOCX documents.
3. Process a source. A local LLM extracts candidate lexemes, corpus passages, and grammar notes; without a configured model, an offline heuristic parses delimited word-list lines and local OCR reads images instead.
4. Review the resulting extraction drafts. Each extraction draft shows its payload, confidence, rationale, and any duplicate badge; accepting commits it, rejecting discards it.
5. Build on the committed data with corpus import and graph browsing, note review, exercise authoring, evaluation, governance, model profiles, and elder corrections.

## Web console

The Vite React app runs at `http://localhost:5173` during local development. It is organized as a language-focused console: the sidebar selects a language, and section navigation switches between four top-level tabs:

- **Start:** language overview, profile-derived counts, saved examples, corpus search, interlinear display, concordance, and corpus graph.
- **Build:** source intake, Obsidian vault import, extraction draft review, note review, and elder/community corrections.
- **Practice:** learner exercises, exercise authoring, model-generated exercise previews, and grounded chat.
- **Settings:** model discovery, saved model profiles, provider tests, evaluation checks, governance records, audit, and exports.

The feature sections below use their domain names so API, code, and documentation stay easy to cross-reference.

### Start and language profile

The profile view presents public linguistic metadata derived from workspace state:

- The declared phonology inventory, when the language has one.
- Public vocabulary from the language's lexicon, each item traceable to its source assets.
- A derived morpheme inventory with corpus-use counts, source passage IDs, glosses, features, and linked lexeme metadata.
- Grammar rules drawn from the language's public notes.
- Counts for corpus passages, notes, exercises, source assets, and pending extraction drafts.

The profile also reports paradigm gaps - a fieldwork to-do derived entirely from the language's own data: when a lemma attests at least two cells along a grammatical dimension (say, two person suffixes on one verb root), the missing cells that are attested elsewhere in the language are listed with their evidence passages, so you know exactly which forms to elicit next.

Use this view to understand what forms and rules the selected language currently supports. A new language starts with an empty profile and fills in as sources are processed and drafts are accepted.

### Build and sources & intake

The intake workspace captures raw materials and turns them into reviewable drafts:

- Register a pasted text, word list, or URL source; import local Obsidian Markdown notes as pending text sources; or upload a file (PDF, DOCX, plain-text documents, images, or audio; 25 MB cap).
- Obsidian import accepts a vault folder path, optional subfolder traversal, and a maximum Markdown-file count. The server skips `.obsidian`, `.git`, and `node_modules`, strips common frontmatter and wikilinks, then stores each readable note as an ordinary pending text source for the same processing and review flow.
- Process a source to generate extraction drafts. The console processes in the background and polls until the source leaves `processing`, so long sources through a slow local model do not block the page. URL sources are fetched and converted to text server-side; images use a vision-capable model or fall back to local OCR; audio is transcribed through a configured transcription endpoint first.
- Review proposed drafts one by one, or select several with the per-draft checkboxes (or "Select all proposed") and accept/reject them in bulk - up to 50 at a time, with a confirm step and a per-draft failure report when some items cannot be reviewed. Duplicate badges warn when a draft repeats an existing entry ("Duplicate of existing entry"), reuses a form with a different gloss ("Same form, different gloss"), repeats a note topic ("Duplicate topic"), or duplicates another pending draft. Badges are advisory and never block a decision. Grounding badges additionally warn when a draft contradicts already-accepted data: a form whose gloss conflicts with an accepted lexeme, a form that decomposes into accepted morphemes (so its gloss probably belongs to a different word), or a corpus segmentation that contradicts an accepted gloss - hover a badge for the full explanation.
- Accepting a lexeme draft adds it to the lexicon; accepting a corpus draft stores the passage with a private answer key and `pending-review` consent status; accepting a grammar-note draft creates a draft note in the normal review queue.
- Failed processing marks the source `failed` with a sanitized error so it can be fixed and retried.
- Processing warnings are shown under the source (for example "used offline heuristic parsing" or "fell back to offline heuristics"), so you can see when extraction fell back to a heuristic or OCR rather than only inferring it from low-confidence drafts.

Nothing extracted by a model enters the workspace without an explicit human accept.

### Start examples and corpus browser

The examples browser shows target-language passages, English translations, morphological segmentation, topic tags, source labels, and consent-use labels. Three display modes are available: cards, an interlinear glossed text mode that aligns each surface form over its gloss with the free translation beneath, and a corpus graph that visualizes passages, morphemes, topics, source assets, notes, exercises, AI sessions, and elder corrections as a role-gated context network. Clicking any morpheme in the text modes filters the list to passages containing that surface form - a lightweight concordance - with an active-filter pill showing the match count.

A command palette (Ctrl+K or Cmd+K) is available everywhere in the console for jumping to a language, opening a workspace view, or toggling the theme.

Reviewers can also import passages directly through the collapsed-by-default "Add source passage" form (so the passage list keeps the screen while browsing). The import flow captures target text, translation, source label, author/year/license/consent record, unique topic tags, structured morpheme segmentation with complete target-token coverage, and consent restrictions.

The API validates the import before saving. It rejects duplicate target passages, duplicate topic tags, duplicate morpheme feature labels, segmentation surfaces that are not present in the target text, target tokens that are not covered by contiguous segmentation surfaces, consent-use values outside the allowed enum, and malformed payloads. When the language declares a phonology inventory, target text is also scanned against it; when the language has a lexicon, each morpheme must be grounded by a lexicon surface or lemma. Successful imports write audit metadata without storing private reviewer data.

### Note review queue

The review queue shows draft notes beside their status, confidence, evidence count, and examples. Notes come from accepted grammar-note drafts, the deterministic study loop, model-backed drafting, or earlier review work. When "Draft notes with model" runs, each generated draft is automatically scored for grounding (evidence resolves, forms are known to the lexicon/corpus, topic aligns with answer keys, examples are covered) and the per-draft percentages appear in the generation status message, so reviewers know which drafts deserve extra scrutiny before approving. Reviewers can:

- Approve notes.
- Contest, reject, defer, or escalate notes with required comments.
- Edit a note explanation through server-side substantive-explanation validation.

A "Draft notes with model" action generates grounded draft notes straight into the queue. It asks the configured model to describe patterns from the language's approved corpus, lexicon, and existing notes, then keeps only notes that cite real corpus evidence and do not duplicate an existing topic; anything ungrounded is dropped and reported. The surviving notes land as ordinary `draft` notes for the same review workflow - they are never auto-approved. This is a model-only action: without a configured model it returns a clear error rather than falling back to a heuristic.

Per-language review policies can require assigned reviewers and approval thresholds. When a threshold is greater than one, a note remains `under_review` until enough approvals are recorded. Assigned-reviewer policies bound the threshold to assigned reviewers; open-reviewer policies bound it to the current assignable reviewer pool.

If assignments change mid-review, earlier approvals stay in the audit trail but no longer satisfy quorum unless the reviewer is still eligible under the current policy.

Repeated contested, rejected, deferred, or escalated decisions for the same note and disposition update the existing open work item instead of creating duplicate open ledger entries.

### Practice and learning lab

The Practice lab previews public learner exercises and submits answers to the API for server-side grading. Public exercise responses omit private answer keys, adversarial probes, and grading explanations.

A "Practice next" panel recommends what to work on using spaced repetition derived from your own submission history: unattempted exercises come first, a correct answer doubles the review interval (1, 2, 4 ... up to 30 days), and a wrong answer resets it, so overdue material resurfaces ahead of comfortable material.

Reviewers can author compact exercises from the web UI. Exercise authoring is validated server-side against:

- Known language IDs.
- Known grammar-rule IDs from the language's notes, with duplicates rejected after whitespace normalization.
- Known vocabulary forms from the language's lexicon once the lexicon is non-empty, with duplicates rejected after whitespace normalization.
- Non-empty expected answers that are unique after whitespace normalization.
- At least two private adversarial answer probes that do not duplicate expected answers or one another.
- Substantive prompts and grading explanations.

A "Generate with model" action pre-fills the authoring form with a grounded draft exercise. The model draws only on the approved lexicon and notes: invented vocabulary and unknown rule references are stripped out, and a draft that cannot be grounded is rejected rather than shown. The result is a preview, not a saved exercise - the author reviews and edits the pre-filled fields and then saves through the normal authoring flow, so answer keys stay human-controlled and nothing is auto-saved. Like draft-note generation, it is model-only and returns a clear error in deterministic mode.

### Evaluation dashboard

The evaluation dashboard shows latest evaluation runs, category scores, regression trends, and failure lines. The local evaluation harness scores these categories:

- Note coverage.
- Note accuracy.
- Evidence accuracy.
- Segmentation accuracy.
- Translation availability.
- Exercise grading.
- Generation-policy checks.

Use **Run System Eval** in the Checks header after creating a language; an empty workspace returns a clear error instead of recording runs. Reviewers can export a sanitized evaluation artifact from this view (the API also allows lead, admin, and programmer). The export includes latest-run totals, failed/regressed run counts, average latest score, failure lines, trend deltas, and SHA-256 integrity metadata. Artifacts from an empty workspace or a workspace that has never run System Eval report `passed: false` with guidance rather than a vacuous green gate.

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

### AI Assistant

The AI Assistant view is a direct chat workspace over the AI session routes. Conversations run in the public learner-practice mode and are grounded only in the selected language's public notes and corpus passages, which are attached to the session as observable evidence. Hidden chain-of-thought is never exposed.

Every assistant reply is labeled honestly: replies from a configured provider carry a model badge, while replies answered by the deterministic offline fallback are flagged with a "deterministic fallback (no model)" warning chip, so canned offline text is never mistaken for a real model answer. A New conversation button discards the current session and starts fresh.

The conversation is fully interactive in natural language: the complete message history is re-sent to the model on every turn, so you can correct the assistant ("that's wrong - ka marks the dual, not the plural") and it applies the correction in later replies. An optional "Conversation setup" field provides standing instructions the assistant follows for the entire session (glossing conventions, reply format, quiz behavior). Replies render basic markdown (bold, italics, code, lists) safely, and the active conversation is remembered per language so a page reload resumes where you left off.

The assistant is a conversation partner, not an authority: its claims carry no special status, and nothing it says changes workspace data - the lexicon, corpus, and notes only change through the reviewed workflows.

### Settings and model setup

The Settings tab reports server-side LLM provider readiness, transcription readiness, saved model profiles, evaluation checks, governance records, exports, and AI session observability. Browser code never receives provider API keys.

Supported provider modes include deterministic fallback, OpenAI-compatible local servers, LM Studio, Ollama, and OpenAI-compatible remote APIs. Audio transcription uses a separate OpenAI-compatible endpoint. Timed-out or failed provider calls are recorded as failed AI sessions with sanitized diagnostics. See the [Configuration Reference](configuration.md) for setup recipes.

The discovered-model dropdown scans configured and common local endpoints. Saved model profiles store named provider/base URL/model combinations, can be activated without restarting, and keep API keys write-only in responses. If no model is configured and exactly one no-key local model is found, the app saves and activates it automatically. Selecting any discovered model also writes the provider/base URL/model settings immediately, so operators can switch between loaded local models without restarting the app. When a saved model is unloaded, Settings warns that the active saved model is stale and offers to apply the loaded replacement or switch back to offline deterministic mode. Long file-path model names are shortened in status messages and the dropdown, while the editable Model field keeps the exact provider value. Manually typed provider settings still use Save settings.

The provider smoke test shows an "offline placeholder" notice when no real model is configured, so a canned deterministic reply is never mistaken for a model response. A Test connection button actively probes the configured provider endpoint (`POST /llm/health-check`) and reports whether it is reachable, unreachable, or not configured - distinct from the static readiness report, which only checks configuration shape.

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
- Reviewer: language creation, source ingestion, extraction-draft review, corpus import, note review, exercise authoring, evaluation artifact export, review policies, and review-disposition workflows.
- Programmer: audit reads, programmer-debug AI sessions, AI observability, and the corpus graph in the Start examples browser.

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
