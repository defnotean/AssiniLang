# Maintenance guide

Recipes for the changes you will actually make, with the files and tests to touch. Run the quality gate (`npm.cmd run verify`) before committing any of them.

## Adding an API route

Routes live in domain modules under `apps/api/src/routes/` (one file per domain: `languages.ts`, `sources.ts`, `governance.ts`, ...). Each module exports a `register...Routes(app, context)` function that `createServer` in `apps/api/src/server.ts` calls with the shared `RouteContext` (state accessors, auth, rate limiter, LLM provider, job queue - see `routes/context.ts`). Cross-domain helpers (audit-event builders, `requireActor`, redaction) live in `apps/api/src/routeHelpers.ts`.

Add a new route to the matching domain module (or create a new module and register it in `server.ts`). Use `POST /languages/:languageId/sources` in `routes/sources.ts` as the template - it is short and shows the full pattern:

1. Parse and validate the body first. Return `400` with a one-line `error` before touching state.
2. Role-gate with `requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"])` and bail with the `401`/`403` shape when it returns `undefined`. Add `checkRateLimit` for mutations.
3. Mutate through `updateState((state) => ...)`. The updater must return the unchanged `state` on validation failure (capture a flag, return the right status after) and a new state object on success - never mutate in place.
4. Append an audit event with `appendAuditEvent(state, { actor, action, entityType, entityId, languageId, summary, metadata })` in the same updater. Keep metadata minimal and non-private: no answer keys, learner answers, prompts, or secrets - persisted reads reject secret-looking metadata.
5. Add red/green tests in `apps/api/src/server.test.ts`: success, invalid body (`400`), unknown language/entity (`404`), missing auth (`401`), and forbidden role (`403`). Existing route suites show the `app.inject` + auth-header pattern.

If the route returns language data publicly, project it through `apps/api/src/publicLanguageViews.ts` (see below) instead of returning raw state.

## Adding a web view or workflow

The console is an App shell (`apps/web/src/App.tsx`: layout, sidebar, theme, top-level state) plus one module per view in `apps/web/src/views/`, shared presentational pieces in `apps/web/src/components/`, and pure helpers/constants/types in `apps/web/src/lib/`:

1. Extend the `ViewMode` union in `lib/types.ts`, add `viewConfig.<mode>.{label,title,eyebrow}` keys in `i18n/en.ts` and `i18n/ar.ts`, and add the mode to `VIEW_ORDER` in `lib/viewConfig.ts` when it belongs in the primary sidebar. Optionally extend `ViewGlyph` and `sectionCounts`.
2. Write the view component as a new file in `views/` following the existing ones (`IngestView`, `CorpusView`, ...): take the selected `languageId`, load through an `AsyncState<T>`, render loading/error/ready states, and mount it from the App shell.
3. Add the client function in `apps/web/src/api.ts` next to its peers (`fetchSources`, `processSource`, ...). Client functions own route construction, the prototype-session actor choice, and payload shape.
4. Tests: route construction, actor/session behavior, and payload shape in `apps/web/src/api.test.ts`; the user workflow (navigate, fill, submit, assert rendered result and error states) in `apps/web/src/App.test.tsx`, which mocks the api module.
5. Keep local form validation to obvious missing fields; the API is the source of truth for domain validation. Extract reusable form-parsing helpers into focused modules with direct tests (`apps/web/src/corpusImport.ts` + `corpusImport.test.ts` is the model).
6. Browser-smoke the workflow after automated tests pass.

## Adding a source kind or document format

Seams in `apps/api/src/ingestion.ts`:

- New document format: extend `TEXT_DOCUMENT_EXTENSIONS` or add a branch in `resolveAssetText` under `asset.kind === "document"` (the PDF/DOCX branches show the dynamic-import pattern). Update the unsupported-type error message.
- New source kind: add the enum value to `sourceAssetKindSchema` (the `z.enum`) in `packages/db/src/schema.ts`, which `sourceAssetSchema.kind` consumes; teach `sourceKindForUpload` in `apps/api/src/routes/sources.ts` (or the registration body parser) to produce it, and handle it in `resolveAssetText` or `extractCandidatesForAsset`.
- Tests live in `apps/api/src/ingestion.test.ts` (pipeline behavior with fake providers/fetch) and `apps/api/src/server.test.ts` (route behavior). Update the source-kinds table and error catalogue in [ingestion.md](ingestion.md).

## Changing the persisted schema

The persisted shape is `appStateSchema` in `packages/db/src/schema.ts` (currently `schemaVersion: 8`).

1. For an additive optional field, extend the relevant record schema with `.optional()` or `.default(...)`; no version bump needed.
2. For a new collection or breaking change, bump the `schemaVersion` literal, keep the old version as a legacy schema (the v1-v7 schemas near the bottom of the file are the pattern), and extend `parseAppState` so legacy databases migrate forward on read.
3. Add integrity checks in the `superRefine` block when the new data references other collections - corrupted local JSON must fail loudly, not leak into public views.
4. Tests: `packages/db/src/store.test.ts` covers parse/migrate/reject paths; `packages/db/src/testing.ts` has state-building helpers. Add a migration test (old-version JSON parses and gains the new field/collection) and a rejection test (malformed new data fails with a useful message).
5. Update the collections list in [architecture.md](architecture.md). The doc test derives the collection names from `appStateSchema` in `schema.ts` and fails if any of them is missing from architecture.md's collections list, and it asserts the `schemaVersion` literal in architecture.md matches the one in `schema.ts` - so adding a collection or bumping the version without touching architecture.md breaks the build.

## Backing up and restoring the local database

`JsonStore` exposes `backupTo(destinationPath)` and `restoreFrom(sourcePath)` for both backends: JSON backups are byte-for-byte copies; SQLite backups use better-sqlite3's online backup API. Restore validates that the backup parses against the current schema before it replaces the live database, and fails loudly (with the database path) otherwise.

From the command line:

```powershell
npm.cmd run db:backup                       # writes data/backups/local-db-<timestamp>.json
npm.cmd run db:backup -- path\to\backup.json
npm.cmd run db:backup -- --dry-run          # resolves source/destination paths without writing
```

`--dry-run` prints the database path and backup destination that would be used, then exits without copying. A successful backup prints a pasteable `new JsonStore("<dbPath>").restoreFrom("<backupPath>")` hint with both paths filled in. Restoring is deliberate (no `db:restore` npm script): run that recipe from a Node REPL or a small script so a bad backup cannot silently replace live data.

## Editing public response shapes safely

All public projection lives in `apps/api/src/publicLanguageViews.ts`: profiles, public exercises, sanitized snapshots (`language-snapshot-v2`), and evaluation artifacts (`evaluation-artifact-v2`) with their SHA-256 integrity manifests.

- Never let answer keys, adversarial probes, grading explanations, learner answers, actor internals, provider prompts, or API keys into a public shape.
- Add redaction tests in `apps/api/src/publicLanguageViews.test.ts` asserting the private fields are absent, plus route-level assertions in `server.test.ts` where the shape is served.
- Snapshot/artifact changes alter the integrity hash input; update the export tests deliberately, and bump the export version string when the shape changes meaningfully.

## Documentation conventions

Each doc owns one topic; link instead of repeating:

| Doc | Owns |
| --- | --- |
| `README.md` | Landing page: overview, quick start, command table, doc index. Keep it at most 150 lines. |
| `docs/configuration.md` | Every environment variable and setup recipe. The only place env vars are exhaustively listed. |
| `docs/ingestion.md` | Source kinds, processing flow, chunking, SSRF guard, OCR, transcription, duplicate flags, ingestion errors. |
| `docs/api.md` | Route index, auth model, per-route behavior and validation. |
| `docs/architecture.md` | Component layout, data model, persistence, validation, projection, evaluation boundaries. |
| `docs/development.md` | Setup, commands, quality gate, browser verification, the build-a-language walkthrough. |
| `docs/maintenance.md` | This file: change recipes and doc conventions. |
| `docs/troubleshooting.md` | Symptom-cause-fix tables. |
| `docs/product-guide.md` / `docs/ui-design.md` | What the app does for users / how the design system maps to the React app. |
| `docs/roadmap.md` | Honest gaps before real community data. |
| `docs/specs/`, `docs/plans/` | Dated history. Do not edit. |

When you change code, update docs in the same change:

- New/changed env var: `docs/configuration.md` (the doc test fails if an `ASSINI_*` variable in source is missing there).
- New/changed route: the route index and relevant section in `docs/api.md`.
- Ingestion behavior or error text: `docs/ingestion.md` and possibly `docs/troubleshooting.md`.
- Schema/collection change: `docs/architecture.md`.
- New doc file: link it from `docs/README.md` (the doc test enforces this) and the README index.

`scripts/documentation.test.ts` guards the docs against source and code:

- Every doc exists with its key headings and sentinels, the README is at most 150 lines, and the hub links every doc in `docs/`.
- Every relative markdown link in `README.md` and `docs/*.md` resolves to a real file.
- Every `ASSINI_*` variable referenced in `apps/`, `packages/`, or `scripts/` is documented in `docs/configuration.md`, as are the non-prefixed vars read from source (`PORT`, `HOST`, `OPENAI_API_KEY`, `OPENAI_MODEL`).
- Every route path registered in `apps/api/src/server.ts` or `apps/api/src/routes/*.ts` (parsed from the `app.get/post/put/patch/delete(...)` calls, count derived from source) appears in the `docs/api.md` route index.
- Every `sourceAssetKindSchema` enum member from `schema.ts` appears in the `docs/ingestion.md` source-kinds table.
- Every `appStateSchema` collection name and the `schemaVersion` literal from `schema.ts` appear in `docs/architecture.md`.

Run it directly with:

```powershell
npx vitest run scripts/documentation.test.ts
```
