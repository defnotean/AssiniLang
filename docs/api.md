# API reference

The API runs on `http://localhost:4321` during local development. Routes are implemented in `apps/api/src/server.ts`; the ingestion pipeline lives in `apps/api/src/ingestion.ts` and is documented in depth in the [Ingestion Deep Dive](ingestion.md).

## Route index

Every route in `server.ts`. "Public" means no auth required; role lists mean the request must carry a prototype session or server-token actor with one of those roles; "any actor" means any authenticated local user.

| Method | Path | Auth / roles | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Health check. |
| POST | `/auth/prototype-session` | Public (requires `ASSINI_ENABLE_PROTOTYPE_AUTH=true`; learner/elder/reviewer/programmer users only) | Open a local HTTP-only prototype session. |
| GET | `/llm/status` | Public | Sanitized LLM provider and transcription readiness. |
| POST | `/llm/health-check` | programmer, lead, admin | Actively probe the configured provider endpoint for reachability. |
| GET | `/users/me` | Any actor | Current prototype user. |
| GET | `/languages` | Public | List languages. |
| POST | `/languages` | reviewer, lead, admin | Create a language. |
| PATCH | `/languages/:languageId` | reviewer, lead, admin | Update language metadata or phonology. |
| GET | `/languages/:languageId/profile` | Public | State-derived public profile. |
| GET | `/languages/:languageId/lexicon` | Public | The language's lexemes. |
| GET | `/languages/:languageId/sources` | Public | List source assets (the async-processing polling target). |
| POST | `/languages/:languageId/sources` | reviewer, lead, admin | Register a `text`, `wordlist`, or `url` source. |
| POST | `/languages/:languageId/sources/upload` | reviewer, lead, admin | Upload a file source (multipart, 25 MB cap). |
| POST | `/sources/:sourceId/process` | reviewer, lead, admin | Run extraction; `{ "async": true }` for background mode. |
| GET | `/languages/:languageId/extraction-drafts` | Public | List drafts with read-time duplicate flags; `?status=` filters. |
| POST | `/extraction-drafts/:draftId/accept` | reviewer, lead, admin | Accept a draft and commit the entity. |
| POST | `/extraction-drafts/:draftId/reject` | reviewer, lead, admin | Reject a proposed draft. |
| GET | `/languages/:languageId/corpus` | Public | Corpus passages for one language. |
| POST | `/languages/:languageId/corpus` | reviewer, lead, admin | Import a validated corpus passage. |
| GET | `/languages/:languageId/notes` | Public | Public review notes. |
| PATCH | `/notes/:noteId/review` | reviewer, lead, admin, elder | Review or edit one note. |
| POST | `/study-loop/draft` | reviewer, lead, admin, elder | Generate deterministic draft notes. |
| POST | `/languages/:languageId/study-loop/model-draft` | reviewer, lead, admin, elder | Generate grounded model-backed draft notes into the review queue (model-only; `400` without a model). |
| GET | `/languages/:languageId/exercises` | Public | Learner exercises without answer keys. |
| POST | `/languages/:languageId/exercises` | reviewer, lead, admin | Author a validated exercise. |
| POST | `/languages/:languageId/exercises/generate` | reviewer, lead, admin | Preview a grounded model-backed draft exercise (model-only, not persisted; `400` without a model). |
| GET | `/exercises/:exerciseId/submissions` | Public | Sanitized submission history. |
| POST | `/exercises/:exerciseId/submissions` | learner, reviewer, lead, admin | Grade and persist a learner answer. |
| GET | `/evaluations` | Public | Previous evaluation runs. |
| POST | `/evaluations/run` | lead, admin, programmer, reviewer | Run evaluation for all languages. |
| GET | `/exports/languages/:languageId/snapshot` | reviewer, elder, lead, admin | Sanitized language snapshot with integrity metadata. |
| GET | `/exports/evaluations/artifact` | reviewer, lead, admin, programmer | Sanitized evaluation artifact. |
| GET | `/governance` | Public | List governance records. |
| POST | `/governance` | elder, lead, admin | Create a consent, access, or generation policy record. |
| GET | `/languages/:languageId/review-policy` | reviewer, elder, lead, admin | Review policy for one language. |
| PUT | `/languages/:languageId/review-policy` | lead, admin (prototype-session reviewer exception) | Update assigned reviewers and threshold. |
| GET | `/languages/:languageId/review-dispositions` | reviewer, elder, lead, admin | Review-disposition work records. |
| PATCH | `/review-dispositions/:dispositionId/resolve` | reviewer, elder, lead, admin | Resolve a disposition work record. |
| GET | `/audit/events` | lead, admin, programmer | Role-gated audit events; `?languageId=` filters. |
| GET | `/languages/:languageId/elder-context` | elder, reviewer, lead, admin | Public context and correction ledger for elder review. |
| GET | `/elder/corrections` | elder, reviewer, lead, admin | Correction records; `?languageId=` filters. |
| POST | `/elder/corrections` | elder, lead, admin | Submit a pending correction. |
| PATCH | `/elder/corrections/:correctionId/review` | elder, lead, admin | Accept or reject a pending correction. |
| PATCH | `/elder/corrections/:correctionId/apply` | elder, lead, admin | Apply an accepted note-linked correction. |
| POST | `/ai/sessions` | Mode-based: learner_practice = learner/elder/reviewer/lead/admin; elder_review = elder/lead/admin; programmer_debug = programmer/admin | Create an AI session with public language context. |
| GET | `/ai/sessions/:sessionId` | Any actor | Return one AI session. |
| POST | `/ai/sessions/:sessionId/messages` | Any actor | Add a message to an AI session. |
| GET | `/observability/ai-sessions` | programmer, admin, lead | Sanitized AI-session observability. |
| GET | `/observability/neural-map` | programmer, admin, lead | Role-gated sanitized context graph. |

## Auth model

The current auth system is a local prototype. It exists to exercise role-aware workflows before production accounts are designed.

Some routes can be called anonymously because they expose public workspace data. Mutating and sensitive read routes require one of the configured local prototype users. The web app opens an HTTP-only prototype session before calling role-gated routes. Server-side callers (tests, scripts) authenticate with `x-assini-user-id` plus the `x-assini-dev-token` header matching `ASSINI_DEV_AUTH_TOKEN`.

Seeded local databases persist the same prototype users used by the API fallback: learner, Elder, reviewer, lead, programmer, and admin. The fallback remains for older local databases that were generated before users were written into `data/local-db.json`.

The browser prototype flow is intentionally leadless. `POST /auth/prototype-session` accepts learner, Elder, reviewer, and programmer users for local UI workflows and rejects lead/admin users. Lead and admin users remain server-token actors for backend tests, administrative workflows, persisted policy authority, and future production-account modeling.

The web app maps local UI actions to the narrowest useful prototype actor:

- Learner practice and learner-mode AI sessions use the learner actor.
- Language creation, source ingestion, extraction-draft review, corpus import, note review, exercise authoring, review-policy editing, and review-disposition workflows use the reviewer actor.
- Governance writes and elder-correction review/apply flows use the Elder actor.
- Audit reads, evaluation artifact reads, programmer AI sessions, and AI observability use the programmer actor. The `GET /observability/neural-map` graph is programmer-token reachable but is not wired into the browser console.

Do not treat prototype auth as production security.

## Common response rules

- Unknown language, source, or draft IDs return `404`.
- Invalid mutation bodies return `400`.
- Missing auth returns `401`; valid auth with an insufficient role returns `403`.
- Mutating methods are rate-limited per actor and route (120 per minute by default); exceeding it returns `429` with a `Retry-After` header.
- Request bodies are capped at 64 KB (`413` beyond that); file uploads at 25 MB.
- Mutation routes validate before changing local state and write audit events when state changes.

## Language management

`POST /languages` and `PATCH /languages/:languageId`

Creation requires nonblank name, description, and orthography; typology defaults to `unknown` when omitted. The phonology object (`consonants`, `vowels`, optional `syllableTemplate` and `stress`, `notes`) is optional but unlocks orthography validation for corpus text once declared. New languages get `status: "active"`, creator attribution, and a default review policy assigned to available reviewers. IDs are slugs derived from the name.

## Source ingestion

`POST /languages/:languageId/sources` registers a pasted `text`, `wordlist`, or `url` source with a title.

`POST /languages/:languageId/sources/upload` accepts one multipart file up to 25 MB. The source kind is detected from MIME type and extension: images become `image`, audio files become `audio`, everything else becomes `document`. Document extraction supports plain-text formats (txt, md, csv, tsv, json), PDF, and DOCX.

`POST /sources/:sourceId/process` runs the extraction pipeline. Processing per kind, chunking and merge rules, fallback behavior, and the full error catalogue are documented in the [Ingestion Deep Dive](ingestion.md). In short:

- `text`/`wordlist`: LLM extraction; without a configured model, offline heuristic parsing of delimited lines.
- `url`: SSRF-guarded server-side fetch and HTML-to-text conversion, then extraction.
- `image`: vision-capable model when configured, otherwise local OCR (tesseract.js).
- `audio`: transcription through `ASSINI_TRANSCRIBE_BASE_URL`, then text extraction.
- `document`: PDF (`unpdf`), DOCX (`mammoth`), or plain-text parsing, then extraction.

Successful processing marks the source `processed`, stores a summary (and transcript for audio), and returns the new `proposed` drafts plus warnings. Failures mark the source `failed` with a sanitized error and return `422`; the source can be reprocessed.

The route also supports background processing for long sources: send a JSON body of `{ "async": true }` and the server validates the same preconditions, marks the source `processing`, and returns `202` with the updated asset (and empty `drafts`/`warnings`). Extraction then runs in the background and persists the same results as the synchronous path: drafts plus `processed` status on success, or `failed` with a sanitized `error` on the asset. Poll `GET /languages/:languageId/sources` until the asset leaves `processing`. A source that is already `processing` returns `409` in both modes.

## Extraction drafts

`GET /languages/:languageId/extraction-drafts` lists drafts; `?status=proposed|accepted|rejected` filters.

Listed proposed drafts may carry a read-time `duplicate` flag, computed per request and never persisted. Existing-workspace matches produce `{ kind, entityId }`: `exact` for a case-insensitive lexeme form+gloss match or a case/whitespace-insensitive corpus target-text match, `form` for a lexeme form that already exists with a different gloss (a possible homonym or gloss refinement), and `topic` for a grammar note repeating an existing note topic. The lexeme `exact` flag requires the draft to carry both a form and a gloss; a form match on a glossless draft yields the `form` flag instead. Topic matching is case- and whitespace-insensitive, like the lexeme and corpus comparisons. When two pending drafts propose the same thing, the later draft gets `{ kind: "pending", draftId }` pointing at the earlier one. Each draft gets at most one flag (existing-entity matches win over pending matches); the flag is advisory and does not block accept or reject.

`POST /extraction-drafts/:draftId/accept` and `POST /extraction-drafts/:draftId/reject`

Only `proposed` drafts can be reviewed; re-reviewing returns `400`.

Accepting commits by draft kind:

- `lexeme`: adds a lexeme (duplicate form+gloss pairs per language are rejected) linked to its source asset.
- `corpus_passage`: stores the passage with consent `pending-review` and restriction `ingested-from-raw-source`, derives a private corpus answer key, and runs the phonology scan when the language declares an inventory. Proposed segmentation that does not fully cover the target text falls back to honest token-level "unanalyzed" morphemes.
- `grammar_note`: creates a `draft` note with the draft's confidence, entering the normal review workflow.

Both decisions record reviewer attribution, the committed entity ID on accept, and an audit event.

## Corpus import

`POST /languages/:languageId/corpus`

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

## Exercise authoring

`POST /languages/:languageId/exercises`

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

## Model-backed generation

Both generation routes are model-only: they reuse the same configured LLM provider as ingestion (the OpenAI-compatible chat/completions endpoint), so the same `ASSINI_LLM_*` configuration that enables ingestion enables them. Unlike ingestion, there is no offline heuristic fallback - in deterministic / no-model mode each route returns `400` with setup guidance instead of degrading. Both are grounded against the language's approved data so the model cannot introduce hallucinated forms, evidence, or rule references.

`POST /languages/:languageId/study-loop/model-draft` (roles: reviewer, lead, admin, elder)

Generates draft grammar notes from the language's approved corpus, lexicon, and existing notes. Each generated note is kept only if it is grounded: it must cite at least one real corpus passage id as evidence, carry a non-empty topic that is not a duplicate of an existing or already-generated note (case- and whitespace-insensitive), and provide a substantive explanation. Ungrounded or hallucinated notes are dropped and reported in `warnings`. Surviving notes are inserted as `draft` notes into the normal review queue - they are not auto-approved and must still be reviewed like any other draft. The response is `{ notes, warnings, generated }`, where `generated` is the count of drafts actually persisted.

`POST /languages/:languageId/exercises/generate` (roles: reviewer, lead, admin)

Generates a single draft exercise grounded in the approved lexicon and notes. `allowedVocabulary` is filtered to real lexeme forms, `allowedRuleIds` is filtered to existing note ids, and the draft is rejected (`422`) if grounding leaves it unusable (no expected answers, no grounded vocabulary, or no prompt). The optional body `{ type? }` requests one of the four exercise types; an unrecognized type falls back to a default with a warning. This route does not persist anything: it returns `{ exercise, warnings }` as a preview that the author reviews and edits, then saves through `POST /languages/:languageId/exercises`. Answer keys stay human-controlled - the model draft is reviewed before save, never auto-committed.

## Exercise submissions

`POST /exercises/:exerciseId/submissions`

Submissions are graded server-side against the private exercise answer key. The response and submission-history route omit the learner answer and local actor ID.

The persisted app-state schema validates restored submission records before the API serves them: each submission must reference an existing exercise, keep the same `languageId`, keep nonblank private answer and grading-explanation text, keep a parseable `submittedAt`, and use a known local actor whose role is allowed to submit answers.

## Governance records

`POST /governance`

Governance records are local policy notes for consent, access, and generation workflows. Writes require an existing language ID and a parseable `effectiveDate`, then append an audit event with policy type and effective date metadata. Persisted records must keep nonblank policy content, a valid language reference, and Elder/lead/admin approver attribution.

## Audit events

`GET /audit/events`

Audit events are written by mutation routes, including language creation, source registration/upload/processing, and extraction-draft decisions. They derive `actorId` plus `actorRole` from the same resolved local user. Persisted audit events must keep nonblank action, entity ID, summary text, and actor IDs, parseable timestamps, and consistent actor attribution; any non-null `languageId` must reference an existing language (`null` remains valid for global or provider-level events). Restored metadata is rejected when it contains private payload keys or secret-looking values.

## Note review

`PATCH /notes/:noteId/review`

Reviewers can update note status and explanations. Contested, rejected, deferred, and escalated notes require a reviewer comment. Those dispositions create work records that can later be resolved by the assignee, leads, or admins.

If the same note already has an open work record for the requested disposition, the route updates that record's reason, assignee, and due date instead of creating a duplicate open disposition. The original opened attribution stays on the record, and a separate audit event records the update.

Approval can be controlled by per-language review policies. If a policy requires multiple approvals, the note remains `under_review` until the threshold is met.

Review-policy updates require at least one assigned reviewer. Assigned reviewer IDs must be nonblank, unique, and must reference users with assignable review roles. When `requiresAssignedReviewer` is true, `approvalThreshold` cannot exceed assigned reviewers. When it is false, `approvalThreshold` cannot exceed the current assignable reviewer pool.

Review-policy updates have a prototype-only reviewer exception so the leadless browser governance UI can edit assignments. Server-token calls still require lead/admin roles. When a prototype reviewer updates a policy, the audit event is attributed to the reviewer session, while persisted `updatedBy` remains the canonical lead/admin policy authority required by the database integrity rules.

Stored approvals remain auditable after policy changes, but only reviewers eligible under the current policy count toward the active approval quorum. The persisted app-state schema enforces one approval per language, note, and reviewer, valid reviewer attribution, and policy uniqueness per language so malformed local JSON cannot create impossible approval quorums.

## Sanitized exports

Language snapshots (`language-snapshot-v2`) and evaluation artifacts (`evaluation-artifact-v2`) include SHA-256 integrity manifests. Snapshots carry the state-derived linguistic profile: phonology, lexicon vocabulary, derived morpheme inventory, grammar rules, and stats including source-asset and pending-draft counts. Evaluation artifacts include latest runs, run histories by language, trend records with category deltas, gate metadata, and failure lines. Both omit private fields such as answer keys, adversarial probes, learner answers, learner submissions, AI sessions, local users, provider prompts, and hidden model traces.

## Evaluation runs

`POST /evaluations/run`

Evaluation runs are generated for existing languages against the workspace corpus (`fixtureVersion: "workspace-corpus-v1"`). Persisted runs are validated during local JSON reads: each run must keep a nonblank language ID that references an existing language, nonblank version and summary text, a parseable `createdAt`, and failure lines that match their parent run's language.

## Elder corrections

`POST /elder/corrections`

Corrections can target a note, a corpus passage, or custom context text. Note and passage targets must belong to the correction language. Submitting a correction records it as `pending_review` and does not mutate note content.

`PATCH /elder/corrections/:correctionId/review`

Only pending corrections can be reviewed. Once a correction is accepted, rejected, or applied, later review attempts return `409` and preserve the existing status and attribution.

`PATCH /elder/corrections/:correctionId/apply`

Only accepted note-linked corrections can be applied. Applying a correction requires a revised note explanation, moves the correction to `applied`, sets the linked note back to `under_review`, appends a note edit-history entry, and writes audit events for both the correction and the note.

The persisted app-state schema enforces the same ledger invariants during local JSON reads: valid language/note/passage references, nonblank correction text and rationale, Elder/lead/admin attribution, chronological timestamps, no review attribution on pending corrections, and a note reference on applied corrections.

## LLM status and sessions

`GET /llm/status` returns provider readiness and transcription readiness without exposing API keys. Transcription readiness reports whether `ASSINI_TRANSCRIBE_BASE_URL` is configured for audio-source processing. It is a static, no-network read of the environment: it checks configuration shape only, not whether the endpoint is actually reachable. See the [Configuration Reference](configuration.md) for every variable.

`POST /llm/health-check` (roles: programmer, lead, admin) actively probes the configured provider endpoint with a real network request and returns `{ reachable, checked, mode, status?, detail?, latencyMs? }`. In deterministic or unconfigured mode it makes no network call and returns `checked: false`. Use it to confirm reachability when `/llm/status` reports a configured provider but ingestion or chat still fails - `/llm/status` only checks config shape, while this route verifies the endpoint answers.

AI session routes use public language context and store sanitized observability records. Failed provider calls preserve safe diagnostics without exposing provider secrets.

`POST /ai/sessions`

Mode-specific roles are enforced for session creation: learner practice accepts learner, Elder, reviewer, lead, and admin users; elder review accepts Elder, lead, and admin users; programmer debug accepts programmer and admin users.

Persisted AI sessions are validated during local JSON reads: valid language and creator references, mode-appropriate creator roles, nonblank diagnostics, parseable chronological timestamps, and same-language context IDs.
