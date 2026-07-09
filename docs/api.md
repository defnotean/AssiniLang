# API reference

The API runs on `http://localhost:4321` during local development. Routes are implemented as domain modules under `apps/api/src/routes/`, registered by `createServer` in `apps/api/src/server.ts`; the ingestion pipeline lives in `apps/api/src/ingestion.ts` and is documented in depth in the [Ingestion Deep Dive](ingestion.md).

## Route index

Every registered route. "Public" means no auth required; role lists mean the request must carry a prototype session or server-token actor with one of those roles; "any actor" means any authenticated local user.

| Method | Path | Auth / roles | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Health check. |
| GET | `/ready` | Public | Readiness check for schema-valid persistence. |
| POST | `/auth/prototype-session` | Public (requires `ASSINI_ENABLE_PROTOTYPE_AUTH=true`; learner/elder/reviewer/programmer users only) | Open a local HTTP-only prototype session. Sessions expire after `ASSINI_PROTOTYPE_SESSION_TTL_MS` (default 8 hours) with sliding renewal on use (server `expiresAt` and cookie `Max-Age` both refresh); creating a session also sweeps expired session records. Empty or whitespace-only session cookie values are treated as absent (same as a missing cookie). When prototype auth is off, returns `404` with `{ "error": "Prototype auth is disabled", "i18nKey": "errors.prototypeAuthDisabled" }`. |
| DELETE | `/auth/prototype-session` | Public (requires `ASSINI_ENABLE_PROTOTYPE_AUTH=true`) | Sign out of the prototype session: deletes the server-side record and expires the cookie. Returns 204 even when no session exists. When prototype auth is off, returns `404` with the same `errors.prototypeAuthDisabled` payload as POST. |
| GET | `/llm/status` | programmer, lead, admin | Sanitized LLM provider, transcription, and OCR readiness. |
| GET | `/llm/settings` | programmer, lead, admin | Sanitized editable runtime settings for model, transcription, OCR, and URL-fetch behavior. |
| GET | `/llm/models` | programmer, lead, admin | Discover model IDs exposed by configured, explicit, and common local OpenAI-compatible endpoints. Optional `?baseUrl=` adds one endpoint to the scan. |
| PUT | `/llm/settings` | programmer, lead, admin | Save local runtime settings to `.env` and apply the active LLM provider without returning secret values. |
| POST | `/llm/model-profiles` | programmer, lead, admin | Save or update a named model profile; optionally activate it immediately. |
| PUT | `/llm/model-profiles/:profileId/activate` | programmer, lead, admin | Activate a saved model profile and hot-swap the active provider. |
| DELETE | `/llm/model-profiles/:profileId` | programmer, lead, admin | Delete a saved model profile. |
| POST | `/llm/health-check` | programmer, lead, admin | Actively probe the configured provider endpoint for reachability. |
| GET | `/users/me` | Any actor | Current prototype user. |
| GET | `/languages` | Public | List languages. |
| POST | `/languages` | reviewer, lead, admin | Create a language. |
| PATCH | `/languages/:languageId` | reviewer, lead, admin | Update language metadata or phonology. |
| DELETE | `/languages/:languageId` | reviewer, lead, admin | Permanently delete one language and its scoped workspace records. |
| GET | `/languages/:languageId/profile` | Public | State-derived public profile. |
| GET | `/languages/:languageId/lexicon` | Public | The language's lexemes. |
| GET | `/languages/:languageId/sources` | reviewer, lead, admin, programmer | List source assets (the async-processing polling target). |
| POST | `/languages/:languageId/sources` | reviewer, lead, admin | Register a `text`, `wordlist`, or `url` source. |
| POST | `/languages/:languageId/sources/obsidian-vault` | reviewer, lead, admin | Import Markdown files from a local Obsidian vault path as pending text sources. |
| POST | `/languages/:languageId/sources/upload` | reviewer, lead, admin | Upload a file source (multipart, 25 MB cap). |
| POST | `/sources/:sourceId/process` | reviewer, lead, admin | Run extraction; `{ "async": true }` for background mode. |
| GET | `/languages/:languageId/extraction-drafts` | reviewer, lead, admin | List drafts with read-time duplicate flags; `?status=` filters. |
| POST | `/extraction-drafts/:draftId/accept` | reviewer, lead, admin | Accept a draft and commit the entity. |
| POST | `/extraction-drafts/:draftId/reject` | reviewer, lead, admin | Reject a proposed draft. |
| POST | `/languages/:languageId/extraction-drafts/bulk-review` | reviewer, lead, admin | Accept or reject up to 50 drafts in one request with per-item results. |
| GET | `/languages/:languageId/corpus` | Public | Corpus passages for one language. |
| POST | `/languages/:languageId/corpus` | reviewer, lead, admin | Import a validated corpus passage. Add `?dryRun=1` or body `dryRun: true` to validate without persisting. |
| GET | `/languages/:languageId/notes` | Public | Public review notes. |
| PATCH | `/notes/:noteId/review` | reviewer, lead, admin, elder | Review or edit one note. |
| POST | `/study-loop/draft` | reviewer, lead, admin, elder | Generate deterministic draft notes. Invalid bodies return `400` with `i18nKey: "errors.missingLanguageId"`; unknown language ids return `404` with `i18nKey: "errors.languageNotFound"`. |
| POST | `/languages/:languageId/study-loop/model-draft` | reviewer, lead, admin, elder | Generate grounded model-backed draft notes into the review queue (model-only; `400` without a model). |
| GET | `/languages/:languageId/exercises` | Public | Learner exercises without answer keys. |
| GET | `/languages/:languageId/exercises/recommended` | Any authenticated actor | Spaced-repetition practice recommendations (top 10 redacted exercises plus rationale). Unknown language ids return `404` with `i18nKey: "errors.languageNotFound"`. |
| POST | `/languages/:languageId/exercises` | reviewer, lead, admin | Author a validated exercise. Add `?dryRun=1` or body `dryRun: true` to validate without persisting. |
| POST | `/languages/:languageId/exercises/generate` | reviewer, lead, admin | Preview a grounded model-backed draft exercise (model-only, not persisted; `400` without a model). |
| GET | `/exercises/:exerciseId/submissions` | learner, reviewer, lead, admin | Sanitized submission history. |
| POST | `/exercises/:exerciseId/submissions` | learner, reviewer, lead, admin | Grade and persist a learner answer. |
| GET | `/evaluations` | lead, admin, programmer, reviewer (not elder/learner) | Previous evaluation runs. |
| POST | `/evaluations/run` | lead, admin, programmer, reviewer (not elder/learner) | Run evaluation for all languages. |
| GET | `/exports/languages/:languageId/snapshot` | reviewer, elder, lead, admin | Sanitized language snapshot with integrity metadata. |
| GET | `/exports/evaluations/artifact` | reviewer, lead, admin, programmer | Sanitized evaluation artifact. |
| GET | `/governance` | reviewer, elder, lead, admin (not programmer) | List governance records. |
| POST | `/governance` | elder, lead, admin | Create a consent, access, or generation policy record. |
| GET | `/languages/:languageId/review-policy` | reviewer, elder, lead, admin | Review policy for one language. |
| PUT | `/languages/:languageId/review-policy` | lead, admin (prototype-session reviewer exception) | Update assigned reviewers and threshold. |
| GET | `/languages/:languageId/review-dispositions` | reviewer, elder, lead, admin | Review-disposition work records. |
| PATCH | `/review-dispositions/resolve` | reviewer, elder, lead, admin | Resolve a disposition work record by request-body id. |
| PATCH | `/review-dispositions/:dispositionId/resolve` | reviewer, elder, lead, admin | Legacy path-id resolver for disposition ids that are safe in URL paths. |
| GET | `/audit/events` | lead, admin, programmer | Role-gated audit events; `?languageId=` filters. |
| GET | `/languages/:languageId/elder-context` | elder, reviewer, lead, admin | Public context and correction ledger for elder review. |
| GET | `/elder/corrections` | elder, reviewer, lead, admin | Correction records; `?languageId=` filters. |
| POST | `/elder/corrections` | elder, lead, admin | Submit a pending correction. Invalid bodies return `400` with `i18nKey: "elderWs.errInvalidCorrectionBody"`; unknown language ids return `404` with `i18nKey: "errors.languageNotFound"`. |
| PATCH | `/elder/corrections/:correctionId/review` | elder, lead, admin | Accept or reject a pending correction. |
| PATCH | `/elder/corrections/:correctionId/apply` | elder, lead, admin | Apply an accepted note-linked correction. |
| POST | `/ai/sessions` | Mode-based: learner_practice = learner/elder/reviewer/lead/admin; elder_review = elder/lead/admin; programmer_debug = programmer/admin | Create an AI session with public language context. |
| GET | `/ai/sessions/:sessionId` | Session owner, lead, admin, or mode-aware roles (elder/reviewer for learner practice; elder for elder review; programmer for programmer debug) | Return one AI session with role-aware redaction. |
| POST | `/ai/sessions/:sessionId/messages` | Session owner or admin (must also pass the same read gate as GET) | Append a follow-up message to an AI session. |
| GET | `/observability/metrics` | programmer, admin, lead | Small safe server metrics snapshot. |
| GET | `/observability/ai-sessions` | programmer, admin, lead | Sanitized AI-session observability. |
| GET | `/observability/neural-map` | programmer, admin, lead | Role-gated sanitized context graph. Missing `languageId` returns `400` with `i18nKey: "errors.missingLanguageId"`; unknown language ids return `404` with `i18nKey: "errors.languageNotFound"`. |

## Auth model

The current auth system is a local prototype. It exists to exercise role-aware workflows before production accounts are designed.

Some routes can be called anonymously because they expose public workspace data. Mutating and sensitive read routes require one of the configured local prototype users. The web app opens an HTTP-only prototype session before calling role-gated routes. Server-side callers (tests, scripts) authenticate with `x-assini-user-id` plus the `x-assini-dev-token` header matching `ASSINI_DEV_AUTH_TOKEN`.

Seeded local databases persist the same prototype users used by the API fallback: learner, Elder, reviewer, lead, programmer, and admin. The fallback remains for older local databases that were generated before users were written into `data/local-db.json`.

The browser prototype flow is intentionally leadless. `POST /auth/prototype-session` accepts learner, Elder, reviewer, and programmer users for local UI workflows and rejects lead/admin users. Lead and admin users remain server-token actors for backend tests, administrative workflows, persisted policy authority, and future production-account modeling.

The web app maps local UI actions to the narrowest useful prototype actor:

- Learner practice and learner-mode AI sessions use the learner actor.
- Language creation, source ingestion, extraction-draft review, corpus import, note review, exercise authoring, review-policy editing, and review-disposition workflows use the reviewer actor.
- Governance writes and elder-correction review/apply flows use the Elder actor.
- Audit reads, programmer AI sessions, operational metrics, AI observability, and the corpus graph in the Examples view use the programmer actor.
- Evaluation artifact export (`GET /exports/evaluations/artifact`) uses the reviewer actor in the browser (the route also allows lead, admin, and programmer).

Do not treat prototype auth as production security.

## Health and readiness

`GET /health` is the cheapest liveness check. It returns `{ "ok": true }` when the API process can answer HTTP.

`GET /ready` is the deeper readiness check. It reads the configured state store through the same schema-validation path used by normal API reads and reports safe job-queue counts. A ready server returns `200` with `{ "ok": true, "checks": { "storage": { "ok": true, "schemaVersion": 8 }, "jobQueue": { "ok": true, "pending": 0, "active": 0 } } }`. If storage cannot be read or validated, or if the queue status cannot be inspected, it returns `503` with sanitized check failures and does not expose local database paths, exception messages, job IDs, API keys, or workspace contents.

`GET /observability/metrics` is a privileged operational snapshot for programmer, lead, and admin actors. It returns a small safe shape: `uptimeMs`, ISO `serverTime`, aggregate `requests` counts by status class, `jobQueue` pending/active counts, and sanitized `storage` status/schema version. It intentionally omits route paths, local filesystem paths, prompts, source text, model content, answer keys, learner answers, user PII, raw errors, and secret values. If storage cannot be read, the response reports `{ "storage": { "ok": false, "error": "Storage read failed" } }` without exposing the underlying exception.

## Common response rules

- Unknown language, source, or draft IDs return `404`.
- Invalid mutation bodies return `400`.
- Missing auth returns `401`; valid auth with an insufficient role returns `403`.
- Mutating methods are rate-limited per actor and route (120 per minute by default); exceeding it returns `429` with a `Retry-After` header and `{ "error": "Rate limit exceeded", "i18nKey": "app.rateLimitExceeded", "i18nParams": { "seconds": N } }`.
- Request bodies are capped at 64 KB (`413` beyond that, with `i18nKey: "errors.payloadTooLarge"`); file uploads at 25 MB.
- Mutation routes validate before changing local state and write audit events when state changes.

## Language management

`POST /languages` and `PATCH /languages/:languageId`

Creation requires nonblank name, description, and orthography; typology defaults to `unknown` when omitted. The phonology object (`consonants`, `vowels`, optional `syllableTemplate` and `stress`, `notes`) is optional but unlocks orthography validation for corpus text once declared. New languages get `status: "active"`, creator attribution, and a default review policy assigned to available reviewers. IDs are slugs derived from the name.

`DELETE /languages/:languageId` (roles: reviewer, lead, admin)

Permanently removes the language and all workspace records scoped to it (corpus, lexicon, notes, exercises, sources, extraction drafts, governance, AI sessions, review records, and related audit history). Uploaded assets under `data/assets/<languageId>/` are removed best-effort. Returns `{ id, name, deleted: true }` on success; `404` when the language does not exist. Appends a `language.deleted` audit event after purge.

## Source ingestion

`POST /languages/:languageId/sources` registers a pasted `text`, `wordlist`, or `url` source with a title.

`POST /languages/:languageId/sources/obsidian-vault` imports Markdown files from a local Obsidian vault folder path. The body is `{ "vaultPath": "...", "includeSubfolders": true, "maxFiles": 100 }`. The vault path must resolve under `ASSINI_OBSIDIAN_VAULT_ROOTS` (semicolon-separated absolute roots); when that env is unset/empty, or the path is outside the allowlist (including `..` / symlink escapes), the route returns `400`. The server reads `.md` files, skips `.obsidian`, `.git`, and `node_modules`, strips common frontmatter and wikilinks, and stores each non-empty note as a pending `text` source. The response reports imported assets, skipped files with reasons, warnings, and counts. Process the imported sources normally to produce extraction drafts.

`POST /languages/:languageId/sources/upload` accepts one multipart file up to 25 MB. The source kind is detected from MIME type and extension: images become `image`, audio files become `audio`, everything else becomes `document`. Document extraction supports plain-text formats (txt, md, csv, tsv, json), PDF, and DOCX.

`POST /sources/:sourceId/process` runs the extraction pipeline. Processing per kind, chunking and merge rules, fallback behavior, and the full error catalogue are documented in the [Ingestion Deep Dive](ingestion.md). In short:

- `text`/`wordlist`: LLM extraction; without a configured model, offline heuristic parsing of delimited lines.
- `url`: SSRF-guarded server-side fetch and HTML-to-text conversion, then extraction.
- `image`: dedicated OCR model when `ASSINI_OCR_BASE_URL` is configured; otherwise vision-capable main LLM; otherwise local tesseract (`ASSINI_OCR_LANG`).
- `audio`: transcription through `ASSINI_TRANSCRIBE_BASE_URL`, then text extraction.
- `document`: PDF (`unpdf`), DOCX (`mammoth`), or plain-text parsing; scanned PDFs with no text layer attempt page-1 OCR when `ASSINI_OCR_BASE_URL` is configured (DOCX OCR remains unshipped), then extraction.

Successful processing marks the source `processed`, stores a summary (and transcript for audio), and returns the new `proposed` drafts plus warnings. Failures mark the source `failed` with a sanitized error and return `422`; the source can be reprocessed.

Each claim increments `processingAttempts` and stamps `processingStartedAt` / `processingHeartbeatAt` on the asset (heartbeats continue while the job runs). After 5 failed or abandoned claims, further `POST /sources/:sourceId/process` calls return `409` with `i18nKey: "ingest.sourceMaxProcessingAttempts"` so operators can stop retry loops and inspect the asset instead of spinning forever.

The route also supports background processing for long sources: send a JSON body of `{ "async": true }` and the server validates the same preconditions, marks the source `processing`, and returns `202` with the updated asset (and empty `drafts`/`warnings`). Extraction then runs in the background and persists the same results as the synchronous path: drafts plus `processed` status on success, or `failed` with a sanitized `error` on the asset. Poll `GET /languages/:languageId/sources` until the asset leaves `processing`. A source that is already `processing` returns `409` with `i18nKey: "ingest.sourceAlreadyProcessing"` in both modes.

## Extraction drafts

`GET /languages/:languageId/extraction-drafts` (roles: reviewer, lead, admin) lists drafts; `?status=proposed|accepted|rejected` filters.

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

Dry-run validation previews the same checks without persisting. Add `?dryRun=1` to the POST URL or include `"dryRun": true` in the JSON body (alongside the normal import fields). The response is `{ "ok": boolean, "errors": string[], "warnings": string[], "preview": CorpusImportBody | null }`. When `ok` is true, `preview` echoes the validated passage fields that would be stored; advisory `warnings` note skipped checks such as missing lexicon or phonology inventory. Dry-run requests still require reviewer, lead, or admin auth but do not append audit events or mutate corpus state.

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

Dry-run validation previews the same checks without persisting. Add `?dryRun=1` to the POST URL or include `"dryRun": true` in the JSON body (alongside the normal authoring fields). The response is `{ "ok": boolean, "errors": string[], "warnings": string[], "preview": ExerciseAuthoringBody | null }`. When `ok` is true, `preview` echoes the validated exercise fields that would be stored. Dry-run requests still require reviewer, lead, or admin auth but do not append audit events or mutate exercise state.

## Model-backed generation

Both generation routes are model-only: they reuse the same configured LLM provider as ingestion (the OpenAI-compatible chat/completions endpoint), so the same `ASSINI_LLM_*` configuration that enables ingestion enables them. Unlike ingestion, there is no offline heuristic fallback - in deterministic / no-model mode each route returns `400` with setup guidance instead of degrading. Both are grounded against the language's approved data so the model cannot introduce hallucinated forms, evidence, or rule references.

`POST /languages/:languageId/study-loop/model-draft` (roles: reviewer, lead, admin, elder)

Generates draft grammar notes from the language's approved corpus, lexicon, and existing notes. Unknown language ids return `404` with `{ "error": "Language not found: …", "i18nKey": "errors.languageNotFound" }`. Each generated note is kept only if it is grounded: it must cite at least one real corpus passage id as evidence, carry a non-empty topic that is not a duplicate of an existing or already-generated note (case- and whitespace-insensitive), and provide a substantive explanation. Ungrounded or hallucinated notes are dropped and reported in `warnings`. Surviving notes are inserted as `draft` notes into the normal review queue - they are not auto-approved and must still be reviewed like any other draft. The response is `{ notes, warnings, generated }`, where `generated` is the count of drafts actually persisted.

`POST /languages/:languageId/exercises/generate` (roles: reviewer, lead, admin)

Generates a single draft exercise grounded in the approved lexicon and notes. `allowedVocabulary` is filtered to real lexeme forms, `allowedRuleIds` is filtered to existing note ids, and the draft is rejected (`422`) if grounding leaves it unusable (no expected answers, no grounded vocabulary, or no prompt). The optional body `{ type? }` requests one of the four exercise types; an unrecognized type falls back to a default with a warning. This route does not persist anything: it returns `{ exercise, warnings }` as a preview that the author reviews and edits, then saves through `POST /languages/:languageId/exercises`. Answer keys stay human-controlled - the model draft is reviewed before save, never auto-committed.

## Exercise submissions

`GET /exercises/:exerciseId/submissions` (roles: learner, reviewer, lead, admin)

Returns sanitized submission history for one exercise. Learner answers and local actor IDs are omitted.

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

Language snapshots (`language-snapshot-v2`) and evaluation artifacts (`evaluation-artifact-v2`) include SHA-256 integrity manifests. The `integrity.contentHash` is SHA-256 over a stable-key-order JSON serialization of the export payload with the `integrity` field omitted (`generatedBy: assini-local-export-v1`). Reviewers can recompute that hash offline—or use `verifyExportIntegrity` in `publicLanguageViews.ts`—to confirm a downloaded file was not altered after export. `verifyExportIntegrity` rejects manifests with a missing or unexpected `algorithm`/`generatedBy`, a non-hex `contentHash`, or a hash that does not match the recomputed payload. Snapshots carry the state-derived linguistic profile: phonology, lexicon vocabulary, derived morpheme inventory, grammar rules, and stats including source-asset and pending-draft counts. Evaluation artifacts include latest runs, run histories by language, trend records with category deltas, gate metadata, and failure lines. Both omit private fields such as answer keys, adversarial probes, learner answers, learner submissions, AI sessions, local users, provider prompts, and hidden model traces. `GET /exports/languages/:languageId/snapshot` returns `404` with `{ "error": "Language not found: …", "i18nKey": "errors.languageNotFound" }` when the language id is unknown.

## Evaluation runs

`POST /evaluations/run`

Evaluation runs are generated for existing languages against the workspace corpus (`fixtureVersion: "workspace-corpus-v1"`). When the workspace has no languages, the route returns `400` with `{ "error": "No languages available to evaluate", "i18nKey": "errors.noLanguagesToEvaluate" }` and does not append runs. Persisted runs are validated during local JSON reads: each run must keep a nonblank language ID that references an existing language, nonblank version and summary text, a parseable `createdAt`, and failure lines that match their parent run's language.

## Elder corrections

`POST /elder/corrections`

Corrections can target a note, a corpus passage, or custom context text. Note and passage targets must belong to the correction language. Submitting a correction records it as `pending_review` and does not mutate note content.

`PATCH /elder/corrections/:correctionId/review`

Only pending corrections can be reviewed. Once a correction is accepted, rejected, or applied, later review attempts return `409` with `i18nKey: "elderWs.errCorrectionNotPending"` and preserve the existing status and attribution. Invalid review bodies return `400` with `i18nKey: "elderWs.errInvalidReviewBody"`; unknown correction ids return `404` with `i18nKey: "elderWs.errCorrectionNotFound"`.

`PATCH /elder/corrections/:correctionId/apply`

Only accepted note-linked corrections can be applied. Applying a correction requires a revised note explanation, moves the correction to `applied`, sets the linked note back to `under_review`, appends a note edit-history entry, and writes audit events for both the correction and the note. Operator-facing negatives include `i18nKey: "elderWs.errCorrectionMustBeAccepted"` (`409` when still pending), `i18nKey: "elderWs.errCorrectionNotLinkedToNote"` (`400` for passage/custom-context-only corrections), `i18nKey: "elderWs.errInvalidApplyBody"` (`400` for a blank explanation), and `i18nKey: "elderWs.errNoteNotFoundForCorrection"` when the linked note is missing.

The persisted app-state schema enforces the same ledger invariants during local JSON reads: valid language/note/passage references, nonblank correction text and rationale, Elder/lead/admin attribution, chronological timestamps, no review attribution on pending corrections, and a note reference on applied corrections.

## LLM status and sessions

`GET /llm/status` returns provider readiness plus nested `transcription` and `ocr` readiness objects without exposing API keys. Each nested object reports `configured`, optional sanitized `baseUrl` and `model`, and the backing env variable names (`baseUrlVariable`, `modelVariable`). Transcription readiness reflects `ASSINI_TRANSCRIBE_BASE_URL` / `ASSINI_TRANSCRIBE_MODEL`; OCR readiness reflects `ASSINI_OCR_BASE_URL` / `ASSINI_OCR_MODEL`. These are static, no-network reads of the environment: they check configuration shape only, not whether the endpoint is actually reachable. See the [Configuration Reference](configuration.md) for every variable.

`GET /llm/settings` and `PUT /llm/settings` are programmer/lead/admin routes for the local settings screen. They expose non-secret runtime values such as provider, base URL, model, timeout, max tokens, JSON mode, transcription endpoint/model, OCR model endpoint, OCR language (tesseract fallback), and the private-URL fetch toggle. API keys are write-only: clients can submit replacements or clear them, but responses only report whether keys are configured via `apiKeyConfigured`, `transcriptionApiKeyConfigured`, and `ocrApiKeyConfigured`. `PUT /llm/settings` writes the repo-root `.env`, updates the running API process environment, and refreshes the active provider for future ingestion, generation, and AI-session calls. Port, host, CORS, and body-limit changes still require restarting the dev launcher.

`POST /llm/model-profiles`, `PUT /llm/model-profiles/:profileId/activate`, and `DELETE /llm/model-profiles/:profileId` manage named runtime model profiles. Profiles store provider/base URL/model and related runtime knobs; API keys are still write-only in responses. Activating a profile materializes its settings into the active runtime env and reloads the provider, so users can switch between loaded local or remote models without restarting the app.

`GET /llm/models` is the Model Setup discovery route. It asks the configured endpoint, any `ASSINI_LLM_DISCOVERY_BASE_URLS` / `ASSINI_MODEL_DISCOVERY_URLS` entries, and common local model servers for OpenAI-compatible `/v1/models`; Ollama endpoints are also checked through native `/api/tags`. It returns sanitized `{ models, errors, scannedAt }` data where each model candidate carries the provider, base URL, and model ID needed by `PUT /llm/settings`. The route does not sweep the whole LAN by default; pass `?baseUrl=http://host:port/v1` or configure discovery URLs for network-hosted model machines.

`POST /llm/health-check` (roles: programmer, lead, admin) actively probes the configured provider endpoint with a real network request and returns `{ reachable, checked, mode, status?, detail?, latencyMs? }`. In deterministic or unconfigured mode it makes no network call and returns `checked: false`. Use it to confirm reachability when `/llm/status` reports a configured provider but ingestion or chat still fails - `/llm/status` only checks config shape, while this route verifies the endpoint answers.

AI session routes use public language context and store sanitized observability records. Failed provider calls preserve safe diagnostics without exposing provider secrets.

`POST /ai/sessions`

Mode-specific roles are enforced for session creation: learner practice accepts learner, Elder, reviewer, lead, and admin users; elder review accepts Elder, lead, and admin users; programmer debug accepts programmer and admin users.

Persisted AI sessions are validated during local JSON reads: valid language and creator references, mode-appropriate creator roles, nonblank diagnostics, parseable chronological timestamps, and same-language context IDs.
