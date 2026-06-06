# API Reference

The API runs on `http://localhost:4321` during local development. Routes are implemented in `apps/api/src/server.ts`.

## Auth Model

The current auth system is a local prototype. It exists to exercise role-aware workflows before production accounts are designed.

Some routes can be called anonymously because they expose synthetic public data. Mutating and sensitive read routes require one of the configured local prototype users. The web app opens an HTTP-only prototype session before calling role-gated routes.

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
| `PATCH /elder/corrections/:correctionId/review` | Accept or reject a correction with reviewer attribution. |
| `PATCH /elder/corrections/:correctionId/apply` | Apply an accepted note-linked correction through a revised explanation. |
| `GET /llm/status` | Return sanitized LLM provider readiness. |
| `POST /ai-sessions` | Create an AI session with public synthetic context. |
| `POST /ai-sessions/:sessionId/messages` | Add a message to an AI session. |
| `GET /observability/ai-sessions` | Return sanitized AI session observability. |
| `GET /neural-map` | Return a role-gated sanitized graph of local AI/session context. |

## Corpus Import

`POST /languages/:languageId/corpus`

Allowed roles: reviewer, lead, admin.

The route imports one synthetic corpus passage after validating provenance, synthetic consent, segmentation, duplicate target text, target-language phonology, and vocabulary grounding.

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
- `topicTags` must contain at least one tag and must be unique after whitespace normalization.
- Each segmentation surface must appear in the target text.
- Every target-text token must be covered by one or more contiguous segmentation surfaces. Hyphen boundaries are normalized for this coverage check so fusional forms can be analyzed with separate suffix surfaces.
- Morpheme feature lists must be unique after whitespace normalization.
- Target text must use symbols from the selected language phonology inventory. Whitespace and explicit morpheme hyphens are allowed.
- Each morpheme must be grounded by the selected language vocabulary surface or lemma.
- Duplicate target text is rejected per language.

Successful imports create a `corpus.imported` audit event.

## Exercise Authoring

`POST /languages/:languageId/exercises`

Allowed roles: reviewer, lead, admin.

The route stores private answer-key fields server-side and returns only the public exercise shape.

Important validation:

- Language ID must exist.
- Allowed grammar-rule IDs must exist for that language and be unique after whitespace normalization.
- Allowed vocabulary forms must exist for that language and be unique after whitespace normalization.
- Prompts and grading explanations must be substantive.
- Expected answers must be present and unique after whitespace normalization.
- At least two adversarial answers are required.
- Adversarial answers must not duplicate accepted answers or another adversarial probe after whitespace normalization.

## Note Review

`PATCH /notes/:noteId/review`

Reviewers can update note status and explanations. Contested, rejected, deferred, and escalated notes require a reviewer comment. Those dispositions create work records that can later be resolved by the assignee, leads, or admins.

Approval can be controlled by per-language review policies. If a policy requires multiple approvals, the note remains `under_review` until the threshold is met.

Review-policy updates require at least one assigned reviewer. Assigned reviewer IDs must be unique and must reference users with assignable review roles. When `requiresAssignedReviewer` is true, `approvalThreshold` cannot exceed assigned reviewers. When it is false, `approvalThreshold` cannot exceed the current assignable reviewer pool.

## Sanitized Exports

Language snapshots and evaluation artifacts include SHA-256 integrity manifests. They omit private fields such as answer keys, learner answers, learner submissions, AI sessions, local users, provider prompts, and hidden model traces.

## LLM Status And Sessions

`GET /llm/status` returns provider readiness without exposing API keys.

AI session routes use public synthetic context and store sanitized observability records. Failed provider calls preserve safe diagnostics without exposing provider secrets.
