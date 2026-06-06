# API Reference

The API runs on `http://localhost:4321` during local development. Routes are implemented in `apps/api/src/server.ts`.

## Auth Model

The current auth system is a local prototype. It exists to exercise role-aware workflows before production accounts are designed.

Some routes can be called anonymously because they expose synthetic public data. Mutating and sensitive read routes require one of the configured local prototype users. The web app opens an HTTP-only prototype session before calling role-gated routes.

Seeded local databases persist the same prototype users used by the API fallback: learner, Elder, reviewer, lead, programmer, and admin. The fallback remains for older local databases that were generated before users were written into `data/local-db.json`. During local JSON reads, restored users must keep nonblank IDs and names, and optional avatar URLs must be nonblank when present.

Do not treat prototype auth as production security.

## Common Response Rules

- Unknown language IDs return `404`.
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
| `GET /languages` | List synthetic languages. |
| `GET /languages/:languageId/profile` | Return public linguistic profile data for one language, including phonology, vocabulary, grammar, paradigms, dialect variants, and a derived morpheme inventory. |
| `GET /languages/:languageId/corpus` | Return corpus passages for one language. |
| `POST /languages/:languageId/corpus` | Import a validated synthetic corpus passage. |
| `GET /languages/:languageId/notes` | Return public review notes for one language. |
| `PATCH /notes/:noteId/review` | Review or edit one note with attribution and policy enforcement. |
| `GET /languages/:languageId/exercises` | Return learner exercises without answer keys. |
| `POST /languages/:languageId/exercises` | Author a validated synthetic exercise. |
| `GET /exercises/:exerciseId/submissions` | Return public learner submission history for one exercise. |
| `POST /exercises/:exerciseId/submissions` | Grade and persist a learner answer. |
| `GET /evaluations` | Return previous evaluation runs. |
| `POST /evaluations/run` | Run evaluation for all languages. |
| `GET /exports/languages/:languageId/snapshot` | Return a sanitized language snapshot with integrity metadata. |
| `GET /exports/evaluations/artifact` | Return a sanitized evaluation artifact with trend and integrity metadata. |
| `GET /governance` | List synthetic governance records. |
| `POST /governance` | Create a synthetic consent, access, or generation policy record. |
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
| `GET /llm/status` | Return sanitized LLM provider readiness. |
| `POST /ai-sessions` | Create an AI session with public synthetic context. |
| `POST /ai-sessions/:sessionId/messages` | Add a message to an AI session. |
| `GET /observability/ai-sessions` | Return sanitized AI session observability. |
| `GET /neural-map` | Return a role-gated sanitized graph of local AI/session context. |

## Language Catalog

`GET /languages`

Languages are seeded synthetic records. During local JSON reads, restored language records must keep nonblank IDs, public names, descriptions, orthography labels, and fixture-source labels before they can appear in public catalogs, snapshots, or profile responses.

## Corpus Import

`POST /languages/:languageId/corpus`

Allowed roles: reviewer, lead, admin.

The route imports one synthetic corpus passage after validating provenance, synthetic consent, segmentation, duplicate target text, target-language phonology, and vocabulary grounding. The response returns only the public corpus passage, but the server also stores a private corpus answer key derived from the validated target text, translation, and segmentation.

Example body:

```json
{
  "source": "synthetic-import",
  "sourceMetadata": {
    "author": "Local Reviewer",
    "year": 2026,
    "license": "synthetic-only",
    "consentRecord": "local synthetic import consent"
  },
  "textTarget": "mira lumo-ke talo-mi-na",
  "textTranslation": "I walk by the river at the practice mat.",
  "morphologicalSegmentation": [
    {
      "surface": "mira",
      "lemma": "mira",
      "gloss": "river",
      "features": ["noun"]
    },
    {
      "surface": "lumo-ke",
      "lemma": "lumo",
      "gloss": "practice-mat.locative",
      "features": ["noun", "case-loc"]
    },
    {
      "surface": "talo-mi-na",
      "lemma": "talo",
      "gloss": "walk.present.1sg",
      "features": ["verb", "present", "1sg"]
    }
  ],
  "topicTags": ["motion", "place", "imported"],
  "consentStatus": {
    "use": "synthetic-testing-only",
    "restrictions": ["local prototype import"]
  }
}
```

Important validation:

- `consentStatus.use` must be `synthetic-testing-only`.
- `source`, source author, source license, source consent record, target text, translation, and consent restrictions must use nonblank text.
- `topicTags` must contain at least one nonblank tag and must be unique after whitespace normalization.
- Each segmentation surface must appear in the target text.
- Every target-text token must be covered by one or more contiguous segmentation surfaces. Hyphen boundaries are normalized for this coverage check so fusional forms can be analyzed with separate suffix surfaces.
- Morpheme surface, lemma, gloss, and feature labels must use nonblank values; feature labels must be unique after whitespace normalization.
- Target text must use symbols from the selected language phonology inventory. Whitespace and explicit morpheme hyphens are allowed.
- Each morpheme must be grounded by the selected language vocabulary surface or lemma.
- Duplicate target text is rejected per language.

Successful imports create a `corpus.imported` audit event. The persisted app-state schema later verifies that corpus passages still reference existing languages, keep nonblank source/provenance text, target text, translations, consent restrictions, topic tags, morpheme surface/lemma/gloss text, and morpheme feature labels, keep normalized topic tags and morpheme feature labels duplicate-free, and preserve target-text segmentation coverage. It also verifies that corpus answer keys still reference existing same-language passages, keep nonblank target text, translations, morpheme text, and feature labels, keep morpheme feature labels duplicate-free, and preserve their own segmentation coverage so manually edited local JSON cannot leave evaluation keys orphaned, malformed, or attached to the wrong language.

## Exercise Authoring

`POST /languages/:languageId/exercises`

Allowed roles: reviewer, lead, admin.

The route stores private answer-key fields server-side and returns only the public exercise shape.

Important validation:

- Language ID must exist.
- Allowed grammar-rule IDs must exist for that language, be nonblank, and be unique after whitespace normalization.
- Allowed vocabulary forms must exist for that language, be nonblank, and be unique after whitespace normalization.
- Prompts and grading explanations must be substantive.
- Expected answers must be present, nonblank, and unique after whitespace normalization.
- At least two adversarial answers are required.
- Adversarial answers and reasons must be nonblank, and adversarial answers must not duplicate accepted answers or another adversarial probe after whitespace normalization.

During local JSON reads, the persisted app-state schema rechecks the exercise invariants it can prove from app state: nonblank language IDs that reference existing languages, nonblank prompt and private grading-explanation text, nonblank private exercise lists, duplicate private answer fields, minimum adversarial probes, expected/adversarial collisions, translate-to-target answers present in same-language corpus text, and choose-particle answers present in allowed vocabulary. Fixture rule/vocabulary existence remains enforced by the live authoring route and fixture validator.

## Exercise Submissions

`POST /exercises/:exerciseId/submissions`

Allowed submitter roles: learner, reviewer, lead, admin.

Submissions are graded server-side against the private exercise answer key. The response and submission-history route omit the learner answer and local actor ID.

The persisted app-state schema validates restored submission records before the API serves them. Each submission must keep nonblank exercise, language, and learner IDs; reference an existing exercise; keep the same `languageId` as that exercise; keep nonblank private answer and grading-explanation text; keep a parseable `submittedAt`; and use a known local actor whose role is allowed to submit learner-exercise answers.

## Governance Records

`POST /governance`

Allowed approver roles: Elder, lead, admin.

Governance records are synthetic policy notes for local consent, access, and generation workflows. Writes require an existing language ID and a parseable `effectiveDate`, then append an audit event with policy type and effective date metadata.

The persisted app-state schema also validates governance records during local JSON reads. Each record must keep a nonblank language ID that references an existing language, keep nonblank policy content, keep a parseable `effectiveDate`, and be attributed to a nonblank known local Elder, lead, or admin, so malformed restored state cannot invent policy records outside the local governance roles or carry unusable policy timelines.

## Audit Events

`GET /audit/events`

Allowed reader roles: lead, admin, programmer.

Audit events are written by mutation routes and derive `actorId` plus `actorRole` from the same resolved local user. During local JSON reads, persisted audit events must keep nonblank action, entity ID, summary text, and actor IDs, parseable timestamps, and consistent actor attribution, and any non-null `languageId` must be nonblank and reference an existing language. `languageId: null` remains valid for global or provider-level events. Restored metadata is also rejected when it contains private payload keys or secret-looking values, while count-only metrics remain valid.

## Note Review

`PATCH /notes/:noteId/review`

Reviewers can update note status and explanations. Contested, rejected, deferred, and escalated notes require a reviewer comment. Those dispositions create work records that can later be resolved by the assignee, leads, or admins.

During local JSON reads, restored notes and note answer keys must reference existing languages, keep topic, explanation, and dialect scope text nonblank, keep `evidenceCount` aligned with `evidencePassageIds`, keep reviewer and edit-history timestamps parseable when present, use review-capable local users or reserved deterministic system actors for reviewer and edit-history attribution, keep reviewer comments and edit-history summaries nonblank, keep edit-history actions inside the known note timeline vocabulary (`created`, `drafted`, `migrated`, `reviewed`, `disposition_resolved`, and `applied_correction`), cite existing same-language evidence passages, and keep examples synchronized with the cited corpus target text and translation.

If the same note already has an open work record for the requested disposition, the route updates that record's reason, assignee, and due date instead of creating a duplicate open disposition. The original opened attribution stays on the record, and a separate audit event records the update.

Persisted review-disposition records must keep nonblank language and note IDs, reference an existing same-language note, use nonblank assignable local users for assignee/opener/resolver fields, keep nonblank reason and resolution text, keep parseable timeline fields (`dueAt`, `openedAt`, and `resolvedAt` when present), prevent resolved timestamps from predating opened timestamps, and keep open versus resolved fields internally consistent. Open disposition work must be attached to a note currently in a disposition status: `contested`, `rejected`, `deferred`, or `escalated`.

Approval can be controlled by per-language review policies. If a policy requires multiple approvals, the note remains `under_review` until the threshold is met.

Review-policy updates require at least one assigned reviewer. Assigned reviewer IDs must be nonblank, unique, and must reference users with assignable review roles. When `requiresAssignedReviewer` is true, `approvalThreshold` cannot exceed assigned reviewers. When it is false, `approvalThreshold` cannot exceed the current assignable reviewer pool.

Stored approvals remain auditable after policy changes, but only reviewers eligible under the current policy count toward the active approval quorum.

The persisted app-state schema enforces the same review-policy assignment, threshold, language, nonblank updater attribution, and parseable update-timestamp rules, so malformed local JSON cannot create impossible approval quorums or policies detached from a real synthetic language. Restored policies are unique per language and must be updated by a known lead/admin user, except seeded policies marked with `system-seed`.

The persisted app-state schema also enforces one approval per language, note, and reviewer. Approval records must keep nonblank language, note, and reviewer IDs; reference an existing same-language note that is still `under_review` or already `approved`; keep a parseable `approvedAt`; and use a known assignable reviewer. This keeps malformed local JSON from double-counting, misattributing, misdating, or reviving inactive quorum decisions.

## Sanitized Exports

Language snapshots and evaluation artifacts include SHA-256 integrity manifests. They omit private fields such as answer keys, learner answers, learner submissions, AI sessions, local users, provider prompts, and hidden model traces.

## Evaluation Runs

`POST /evaluations/run`

Evaluation runs are generated for existing synthetic languages. Persisted runs are validated during local JSON reads: each run must reference an existing language, keep nonblank system version, fixture version, score category, and summary text, keep a parseable `createdAt`, and every stored failure line must use the same language ID as its parent run with nonblank category, item ID, and diagnostic message.

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

The persisted app-state schema enforces the same ledger invariants during local JSON reads: correction language IDs must be nonblank and resolve to an existing synthetic language; correction note and passage IDs, when present, must be nonblank and resolve within that same language; correction text, rationale, and custom context text must stay nonblank; proposer and reviewer IDs must be nonblank known Elder/lead/admin users; `proposedAt` and non-null `reviewedAt` values must be parseable; review timestamps cannot precede proposal timestamps; pending corrections cannot carry review attribution; reviewed corrections must include `reviewedBy` and `reviewedAt`; and applied corrections must reference a note.

## LLM Status And Sessions

`GET /llm/status` returns provider readiness without exposing API keys.

AI session routes use public synthetic context and store sanitized observability records. Failed provider calls preserve safe diagnostics without exposing provider secrets.

`POST /ai/sessions`

Mode-specific roles are enforced for session creation: learner practice accepts learner, Elder, reviewer, lead, and admin users; elder review accepts Elder, lead, and admin users; programmer debug accepts programmer and admin users.

Persisted AI sessions are validated during local JSON reads. Each session must keep nonblank language and creator IDs, reference an existing language, use a creator whose local role is allowed for the session mode, keep nonblank thinking summaries, message content, trace labels, trace summaries, trace warnings, privacy redaction labels, and context note/corpus passage IDs, keep parseable `createdAt`, `updatedAt`, and message timestamps in chronological order, and keep all context IDs within the same language.
