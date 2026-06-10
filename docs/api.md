# API Reference

The API runs on `http://localhost:4321` during local development. Routes are implemented in `apps/api/src/server.ts`; the ingestion pipeline lives in `apps/api/src/ingestion.ts`.

## Auth Model

The current auth system is a local prototype. It exists to exercise role-aware workflows before production accounts are designed.

Some routes can be called anonymously because they expose public workspace data. Mutating and sensitive read routes require one of the configured local prototype users. The web app opens an HTTP-only prototype session before calling role-gated routes.

Seeded local databases persist the same prototype users used by the API fallback: learner, Elder, reviewer, lead, programmer, and admin. The fallback remains for older local databases that were generated before users were written into `data/local-db.json`.

The browser prototype flow is intentionally leadless. `POST /auth/prototype-session` accepts learner, Elder, reviewer, and programmer users for local UI workflows and rejects lead/admin users. Lead and admin users remain server-token actors for backend tests, administrative workflows, persisted policy authority, and future production-account modeling.

The web app maps local UI actions to the narrowest useful prototype actor:

- Learner practice and learner-mode AI sessions use the learner actor.
- Language creation, source ingestion, extraction-draft review, corpus import, note review, exercise authoring, review-policy editing, and review-disposition workflows use the reviewer actor.
- Governance writes and elder-correction review/apply flows use the Elder actor.
- Audit reads, evaluation artifact reads, programmer AI sessions, AI observability, and neural-map inspection use the programmer actor.

Do not treat prototype auth as production security.

## Common Response Rules

- Unknown language, source, or draft IDs return `404`.
- Invalid mutation bodies return `400`.
- Missing auth returns `401`.
- Valid auth with an insufficient role returns `403`.
- Mutation routes validate before changing local state.
- Mutation routes write audit events when state changes.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /health` | Health check. |
| `POST /auth/prototype-session` | Open a local HTTP-only prototype session for an allowed user. |
| `GET /users/me` | Return the current prototype user. |
| `GET /languages` | List languages. |
| `POST /languages` | Create a language with name, typology, description, orthography, and optional phonology. |
| `PATCH /languages/:languageId` | Update language metadata or phonology. |
| `GET /languages/:languageId/profile` | Return the state-derived public profile: phonology, lexicon vocabulary, derived morpheme inventory, grammar rules, and stats. |
| `GET /languages/:languageId/lexicon` | Return the language's lexemes. |
| `GET /languages/:languageId/sources` | List the language's source assets. |
| `POST /languages/:languageId/sources` | Register a text, wordlist, or url source. |
| `POST /languages/:languageId/sources/upload` | Upload a file source (multipart, 25 MB cap). |
| `POST /sources/:sourceId/process` | Run extraction on a source and create proposed drafts. |
| `GET /languages/:languageId/extraction-drafts` | List extraction drafts, optionally filtered by `status`. |
| `POST /extraction-drafts/:draftId/accept` | Accept a draft and commit a lexeme, corpus passage, or grammar note. |
| `POST /extraction-drafts/:draftId/reject` | Reject a proposed draft. |
| `GET /languages/:languageId/corpus` | Return corpus passages for one language. |
| `POST /languages/:languageId/corpus` | Import a validated corpus passage. |
| `GET /languages/:languageId/notes` | Return public review notes for one language. |
| `PATCH /notes/:noteId/review` | Review or edit one note with attribution and policy enforcement. |
| `POST /study-loop/draft` | Generate deterministic draft notes for a language. |
| `GET /languages/:languageId/exercises` | Return learner exercises without answer keys. |
| `POST /languages/:languageId/exercises` | Author a validated exercise. |
| `GET /exercises/:exerciseId/submissions` | Return public learner submission history for one exercise. |
| `POST /exercises/:exerciseId/submissions` | Grade and persist a learner answer. |
| `GET /evaluations` | Return previous evaluation runs. |
| `POST /evaluations/run` | Run evaluation for all languages. |
| `GET /exports/languages/:languageId/snapshot` | Return a sanitized language snapshot with integrity metadata. |
| `GET /exports/evaluations/artifact` | Return a sanitized evaluation artifact with trend and integrity metadata. |
| `GET /governance` | List governance records. |
| `POST /governance` | Create a consent, access, or generation policy record. |
| `GET /languages/:languageId/review-policy` | Return review policy for one language. |
| `PUT /languages/:languageId/review-policy` | Update assigned reviewers and approval threshold. |
| `GET /languages/:languageId/review-dispositions` | Return review-disposition work records for one language. |
| `PATCH /review-dispositions/:dispositionId/resolve` | Resolve a review-disposition work record. |
| `GET /audit/events` | Read role-gated audit events, optionally filtered by `languageId`. |
| `GET /languages/:languageId/elder-context` | Return public context and correction ledger for elder review. |
| `GET /elder/corrections` | Return correction records, optionally filtered by language ID. |
| `POST /elder/corrections` | Submit a pending elder correction without mutating notes. |
| `PATCH /elder/corrections/:correctionId/review` | Accept or reject a pending correction with reviewer attribution. |
| `PATCH /elder/corrections/:correctionId/apply` | Apply an accepted note-linked correction through a revised explanation. |
| `GET /llm/status` | Return sanitized LLM provider and transcription readiness. |
| `POST /ai/sessions` | Create an AI session with public language context. |
| `GET /ai/sessions/:sessionId` | Return one AI session. |
| `POST /ai/sessions/:sessionId/messages` | Add a message to an AI session. |
| `GET /observability/ai-sessions` | Return sanitized AI session observability. |
| `GET /observability/neural-map` | Return a role-gated sanitized graph of local AI/session context. |

## Language Management

`POST /languages` and `PATCH /languages/:languageId`

Allowed roles: reviewer, lead, admin.

Creation requires nonblank name, description, and orthography; typology defaults to `unknown` when omitted. The phonology object (`consonants`, `vowels`, optional `syllableTemplate` and `stress`, `notes`) is optional but unlocks orthography validation for corpus text once declared. New languages get `status: "active"`, creator attribution, and a default review policy assigned to available reviewers. IDs are slugs derived from the name.

## Source Ingestion

`POST /languages/:languageId/sources` registers a pasted `text`, `wordlist`, or `url` source with a title.

`POST /languages/:languageId/sources/upload` accepts one multipart file up to 25 MB. The source kind is detected from MIME type and extension: images become `image`, audio files become `audio`, everything else becomes `document`. Document extraction currently supports plain-text formats (txt, md, csv, tsv, json) only.

`POST /sources/:sourceId/process` runs the extraction pipeline. Allowed roles for all three: reviewer, lead, admin.

Processing per kind:

- `text`/`wordlist`: LLM extraction; when no real model is configured, an offline heuristic parses delimited lines (`=`, `-`, tab, pipe) into low-confidence drafts.
- `url`: server-side fetch (http/https, size-capped) and HTML-to-text conversion, then LLM extraction.
- `image`: requires a vision-capable OpenAI-compatible model; the image is sent as base64 content.
- `audio`: transcribed through the `ASSINI_TRANSCRIBE_BASE_URL` endpoint, then the transcript goes through LLM extraction.

Successful processing marks the source `processed`, stores a summary (and transcript for audio), and returns the new `proposed` drafts plus warnings. Failures mark the source `failed` with a sanitized error and return `422`; the source can be reprocessed.

The route also supports background processing for long sources: send a JSON body of `{ "async": true }` and the server validates the same preconditions, marks the source `processing`, and returns `202` with the updated asset (and empty `drafts`/`warnings`). Extraction then runs in the background and persists the same results as the synchronous path: drafts plus `processed` status on success, or `failed` with a sanitized `error` on the asset. Poll `GET /languages/:languageId/sources` until the asset leaves `processing`. A source that is already `processing` returns `409` in both modes.

## Extraction Drafts

`GET /languages/:languageId/extraction-drafts` lists drafts; `?status=proposed|accepted|rejected` filters.

Listed proposed drafts may carry a read-time `duplicate` flag, computed per request and never persisted. Existing-workspace matches produce `{ kind, entityId }`: `exact` for a case-insensitive lexeme form+gloss match or a case/whitespace-insensitive corpus target-text match, `form` for a lexeme form that already exists with a different gloss (a possible homonym or gloss refinement), and `topic` for a grammar note repeating an existing note topic. When two pending drafts propose the same thing, the later draft gets `{ kind: "pending", draftId }` pointing at the earlier one. Each draft gets at most one flag (existing-entity matches win over pending matches); the flag is advisory and does not block accept or reject.

`POST /extraction-drafts/:draftId/accept` and `POST /extraction-drafts/:draftId/reject`

Allowed roles: reviewer, lead, admin. Only `proposed` drafts can be reviewed; re-reviewing returns `400`.

Accepting commits by draft kind:

- `lexeme`: adds a lexeme (duplicate form+gloss pairs per language are rejected) linked to its source asset.
- `corpus_passage`: stores the passage with consent `pending-review` and restriction `ingested-from-raw-source`, derives a private corpus answer key, and runs the phonology scan when the language declares an inventory. Proposed segmentation that does not fully cover the target text falls back to honest token-level "unanalyzed" morphemes.
- `grammar_note`: creates a `draft` note with the draft's confidence, entering the normal review workflow.

Both decisions record reviewer attribution, the committed entity ID on accept, and an audit event.

## Corpus Import

`POST /languages/:languageId/corpus`

Allowed roles: reviewer, lead, admin.

The route imports one corpus passage after validating provenance, consent, segmentation, and duplicate target text. The response returns only the public corpus passage, but the server also stores a private corpus answer key derived from the validated target text, translation, and segmentation.

Example body:

```json
{
  "source": "field-notebook-2026",
  "sourceMetadata": {
    "author": "Local Reviewer",
    "year": 2026,
    "license": "user-provided",
    "consentRecord": "local import consent"
  },
  "textTarget": "mira lumo-ke talo-mi-na",
  "textTranslation": "I walk by the river at the practice mat.",
  "morphologicalSegmentation": [
    { "surface": "mira", "lemma": "mira", "gloss": "river", "features": ["noun"] },
    { "surface": "lumo-ke", "lemma": "lumo", "gloss": "practice-mat.locative", "features": ["noun", "case-loc"] },
    { "surface": "talo-mi-na", "lemma": "talo", "gloss": "walk.present.1sg", "features": ["verb", "present", "1sg"] }
  ],
  "topicTags": ["motion", "place", "imported"],
  "consentStatus": {
    "use": "personal-study",
    "restrictions": ["local prototype import"]
  }
}
```

Important validation:

- `consentStatus.use` must be one of the consent-use enum values: `testing-only`, `community-approved`, `personal-study`, `research`, `public-domain`, `licensed`, or `pending-review`.
- `source`, source author, source license, source consent record, target text, translation, and consent restrictions must use nonblank text.
- `topicTags` must contain at least one nonblank tag and must be unique after whitespace normalization.
- Each segmentation surface must appear in the target text.
- Every target-text token must be covered by one or more contiguous segmentation surfaces. Hyphen boundaries are normalized for this coverage check so fusional forms can be analyzed with separate suffix surfaces.
- Morpheme surface, lemma, gloss, and feature labels must use nonblank values; feature labels must be unique after whitespace normalization.
- When the language declares a phonology inventory, target text must use symbols from it (whitespace and explicit morpheme hyphens are allowed). Languages without a declared inventory skip this scan.
- When the language has a non-empty lexicon, each morpheme must be grounded by a lexicon surface or lemma. Languages without a lexicon skip grounding.
- Duplicate target text is rejected per language.

Successful imports create a `corpus.imported` audit event. The persisted app-state schema later re-verifies that passages and answer keys keep nonblank fields, valid language references, duplicate-free tags and features, and full segmentation coverage so manually edited local JSON cannot leave evaluation keys orphaned, malformed, or attached to the wrong language.

## Exercise Authoring

`POST /languages/:languageId/exercises`

Allowed roles: reviewer, lead, admin.

The route stores private answer-key fields server-side and returns only the public exercise shape.

Important validation:

- Language ID must exist.
- Allowed grammar-rule IDs must reference the language's notes or note answer keys, be nonblank, and be unique after whitespace normalization.
- Allowed vocabulary forms must exist in the language's lexicon once the lexicon is non-empty, be nonblank, and be unique after whitespace normalization. Early-stage languages without a lexicon can author freely.
- Prompts and grading explanations must be substantive.
- Expected answers must be present, nonblank, and unique after whitespace normalization.
- At least two adversarial answers are required.
- Adversarial answers and reasons must be nonblank, and adversarial answers must not duplicate accepted answers or another adversarial probe.
- Translate-to-target expected answers must be present in same-language corpus text; choose-particle answers must be inside the exercise's allowed vocabulary.

## Exercise Submissions

`POST /exercises/:exerciseId/submissions`

Allowed submitter roles: learner, reviewer, lead, admin.

Submissions are graded server-side against the private exercise answer key. The response and submission-history route omit the learner answer and local actor ID.

The persisted app-state schema validates restored submission records before the API serves them: each submission must reference an existing exercise, keep the same `languageId`, keep nonblank private answer and grading-explanation text, keep a parseable `submittedAt`, and use a known local actor whose role is allowed to submit answers.

## Governance Records

`POST /governance`

Allowed approver roles: Elder, lead, admin.

Governance records are local policy notes for consent, access, and generation workflows. Writes require an existing language ID and a parseable `effectiveDate`, then append an audit event with policy type and effective date metadata. Persisted records must keep nonblank policy content, a valid language reference, and Elder/lead/admin approver attribution.

## Audit Events

`GET /audit/events`

Allowed reader roles: lead, admin, programmer.

Audit events are written by mutation routes, including language creation, source registration/upload/processing, and extraction-draft decisions. They derive `actorId` plus `actorRole` from the same resolved local user. Persisted audit events must keep nonblank action, entity ID, summary text, and actor IDs, parseable timestamps, and consistent actor attribution; any non-null `languageId` must reference an existing language (`null` remains valid for global or provider-level events). Restored metadata is rejected when it contains private payload keys or secret-looking values.

## Note Review

`PATCH /notes/:noteId/review`

Reviewers can update note status and explanations. Contested, rejected, deferred, and escalated notes require a reviewer comment. Those dispositions create work records that can later be resolved by the assignee, leads, or admins.

If the same note already has an open work record for the requested disposition, the route updates that record's reason, assignee, and due date instead of creating a duplicate open disposition. The original opened attribution stays on the record, and a separate audit event records the update.

Approval can be controlled by per-language review policies. If a policy requires multiple approvals, the note remains `under_review` until the threshold is met.

Review-policy updates require at least one assigned reviewer. Assigned reviewer IDs must be nonblank, unique, and must reference users with assignable review roles. When `requiresAssignedReviewer` is true, `approvalThreshold` cannot exceed assigned reviewers. When it is false, `approvalThreshold` cannot exceed the current assignable reviewer pool.

Review-policy updates have a prototype-only reviewer exception so the leadless browser governance UI can edit assignments. Server-token calls still require lead/admin roles. When a prototype reviewer updates a policy, the audit event is attributed to the reviewer session, while persisted `updatedBy` remains the canonical lead/admin policy authority required by the database integrity rules.

Stored approvals remain auditable after policy changes, but only reviewers eligible under the current policy count toward the active approval quorum. The persisted app-state schema enforces one approval per language, note, and reviewer, valid reviewer attribution, and policy uniqueness per language so malformed local JSON cannot create impossible approval quorums.

## Sanitized Exports

Language snapshots (`language-snapshot-v2`) and evaluation artifacts (`evaluation-artifact-v2`) include SHA-256 integrity manifests. Snapshots carry the state-derived linguistic profile: phonology, lexicon vocabulary, derived morpheme inventory, grammar rules, and stats including source-asset and pending-draft counts. Evaluation artifacts include latest runs, run histories by language, trend records with category deltas, gate metadata, and failure lines. Both omit private fields such as answer keys, adversarial probes, learner answers, learner submissions, AI sessions, local users, provider prompts, and hidden model traces.

## Evaluation Runs

`POST /evaluations/run`

Evaluation runs are generated for existing languages against the workspace corpus (`fixtureVersion: "workspace-corpus-v1"`). Persisted runs are validated during local JSON reads: each run must keep a nonblank language ID that references an existing language, nonblank version and summary text, a parseable `createdAt`, and failure lines that match their parent run's language.

## Elder Corrections

`POST /elder/corrections`

Allowed submitter roles: Elder, lead, admin.

Corrections can target a note, a corpus passage, or custom context text. Note and passage targets must belong to the correction language. Submitting a correction records it as `pending_review` and does not mutate note content.

`PATCH /elder/corrections/:correctionId/review`

Allowed reviewer roles: Elder, lead, admin.

Only pending corrections can be reviewed. Once a correction is accepted, rejected, or applied, later review attempts return `409` and preserve the existing status and attribution.

`PATCH /elder/corrections/:correctionId/apply`

Allowed applier roles: Elder, lead, admin.

Only accepted note-linked corrections can be applied. Applying a correction requires a revised note explanation, moves the correction to `applied`, sets the linked note back to `under_review`, appends a note edit-history entry, and writes audit events for both the correction and the note.

The persisted app-state schema enforces the same ledger invariants during local JSON reads: valid language/note/passage references, nonblank correction text and rationale, Elder/lead/admin attribution, chronological timestamps, no review attribution on pending corrections, and a note reference on applied corrections.

## LLM Status And Sessions

`GET /llm/status` returns provider readiness and transcription readiness without exposing API keys. Transcription readiness reports whether `ASSINI_TRANSCRIBE_BASE_URL` is configured for audio-source processing.

AI session routes use public language context and store sanitized observability records. Failed provider calls preserve safe diagnostics without exposing provider secrets.

`POST /ai/sessions`

Mode-specific roles are enforced for session creation: learner practice accepts learner, Elder, reviewer, lead, and admin users; elder review accepts Elder, lead, and admin users; programmer debug accepts programmer and admin users.

Persisted AI sessions are validated during local JSON reads: valid language and creator references, mode-appropriate creator roles, nonblank diagnostics, parseable chronological timestamps, and same-language context IDs.
