# Maximized Functionality Improvement Plan

> **Status (2026-06-15): superseded.** Do not use this dated wave plan as the active roadmap. The current production-readiness status and remaining blockers live in [`docs/roadmap.md`](../../roadmap.md). This file is retained as historical planning context only; unchecked boxes below are the original task list, not an instruction to start work without checking the active roadmap.
>
> Implemented or partially implemented since this plan was written: model-draft grounding/scoring and model-draft evaluation selection (partial: not persisted as provider/model baselines), SQLite `schema_meta` migrations plus backup/restore, startup recovery for interrupted processing (partial: no durable heartbeat/resume/attempt counts), bulk draft review, and most CI hardening (Windows/Linux matrix, verify, smoke, built-dist health/ready, audit gate).

**Goal (historical):** Take AssiniLang from a verified local prototype to a significantly more capable, robust, and production-leaning platform — closing the study loop, hardening the new SQLite persistence layer, expanding evaluation, and improving everyday usability — while preserving the synthetic-only data gate.

**Architecture:** Keep the Fastify + React + Zod + npm-workspaces shape. Build on the freshly landed runtime envelope (validated config, graceful shutdown, dist/ entrypoints), the SQLite/drizzle-orm store (schema v8), the `/ready` probe, and the `@assini/api-contract` package. New work should extend these seams rather than introduce parallel ones.

**Tech Stack:** TypeScript, React 19, Vite, Fastify 5, Zod, better-sqlite3 + drizzle-orm, Vitest, GitHub Actions.

**Current verified baseline (2026-06-11):** `npm run check`, `npm test` (625 passing), `npm run build`, `npm run smoke`, `npm run verify`, built-dist startup smoke (`GET /health`, `GET /ready`), and `npm audit` (0 vulnerabilities) all pass on `defnotean/repo-improvement-pass`.

---

## Wave 1 — Close the loop and harden persistence (highest leverage)

### Task 1: Closed model-draft study loop

The eval harness scores human-reviewed notes against immutable answer keys, but model drafts (`POST /languages/:id/study-loop/model-draft`, `POST /languages/:id/exercises/generate`) are never scored automatically.

**Files:** `packages/eval/src/runEvaluation.ts`, `packages/eval/src/studyLoop.ts`, new `packages/eval/src/modelDraftScoring.ts` + tests, `apps/api/src/server.ts` (optional trigger route).

- [ ] Write failing tests: a model draft scored against its language's `noteAnswerKeys` produces a per-draft score record with failure reasons (hallucinated forms, ungrounded evidence, topic mismatch).
- [ ] Implement `scoreModelDraft` reusing existing `scoring.ts` primitives; never mutate answer keys.
- [ ] Persist per-draft score + uncertainty + failure-reason taxonomy in evaluation runs (extend schema with migration-safe parse).
- [ ] Surface scored drafts in the Eval Dashboard (read-only trend per provider/model).
- [ ] Run `npm test`, `npm run seed`, `npm run eval`.

### Task 2: SQLite migration framework + backup/restore

The store now rides on better-sqlite3 but schema evolution still depends on Zod-parse promotion. Crashes mid-write and version bumps need first-class handling.

**Files:** `packages/db/src/store.ts`, new `packages/db/src/migrations.ts` + tests, `packages/db/src/backup.ts` + tests.

- [ ] Add a `schema_meta` table holding the persisted schema version; write failing tests for v(n) → v(n+1) promotion at the SQLite layer.
- [ ] Implement ordered, transactional migrations (one transaction per migration; failure rolls back fully).
- [ ] Add `backupTo(path)` / `restoreFrom(path)` using SQLite's online backup; test a backup–corrupt–restore round trip.
- [ ] Add `npm run db:backup` workspace script and document it in `docs/maintenance.md`.

### Task 3: Resumable ingestion jobs

A crash mid-processing leaves sources stuck in `processing` (known roadmap gap §3).

**Files:** `apps/api/src/jobQueue.ts`, `apps/api/src/ingestion.ts` + tests.

- [ ] Write failing tests: on startup, sources stuck `processing` past a staleness threshold are reset to `pending` with an audit event.
- [ ] Persist job state (attempt count, last heartbeat) in the store; add startup recovery sweep wired into `index.ts` after `readRuntimeConfig`.
- [ ] Add max-attempts → `failed` terminal state with operator-visible error.
- [ ] Run `npm test` and `npm run smoke`.

## Wave 2 — Functionality expansion

### Task 4: Bulk draft review

- [ ] Add `POST /languages/:id/extraction-drafts/bulk-review` accepting up to N draft ids + disposition; reuse single-draft validation per item, partial-failure report in response.
- [ ] Web: multi-select checkboxes + bulk Accept/Reject bar in the Review Queue with confirmation dialog.
- [ ] Keep public DTOs redacted (no answer keys, reviewers' internals, learner ids).

### Task 5: Evaluation baselines and regression reports

- [ ] Add named baseline retention: `POST /evaluation/baselines` snapshots a run; immutable thereafter.
- [ ] Add regression comparison (current run vs named baseline) with per-metric deltas and an exportable JSON/markdown report.
- [ ] Web: baseline picker + delta view on the Eval Dashboard using the existing `evaluationTrends.ts` helpers.

### Task 6: Richer authoring

- [ ] Note editor: structured example editing (add/remove/edit example rows) instead of explanation-only edits, with pre-save Zod validation preview.
- [ ] Multi-probe exercise authoring: author N probes per exercise with per-probe answer-key entry; keys remain human-controlled and server-side only.
- [ ] Bulk corpus import: extend `corpusImport.ts` to accept TSV/CSV with a dry-run validation report before commit.

## Wave 3 — Operability and polish

### Task 7: Observability

- [ ] Request-id correlation: assign/propagate `x-request-id`, include it in error payloads and logger output (logger already togglable via `ASSINI_API_LOGGER`).
- [ ] Add `/metrics`-lite JSON endpoint (uptime, request counts by route class, job queue depth, store size) — no secrets, admin-role gated.
- [ ] Extend `/ready` to include job-queue recovery status.

### Task 8: CI/CD hardening

- [ ] Extend `.github/workflows/ci.yml` with an `npm audit --audit-level=high` gate and the built-dist startup smoke (start `node apps/api/dist/index.js` with temp `ASSINI_DB_PATH`, curl `/health` + `/ready`, kill).
- [ ] Add a Windows + Linux matrix (the dev environment is Windows; CI parity catches path/line-ending drift).
- [ ] Cache npm and tsc incremental state for faster runs.

### Task 9: UX/a11y pass

- [ ] Keyboard navigation + focus management audit across Review Queue, Corpus Browser, Learning Lab, Eval Dashboard, Governance, Elder Workspace.
- [ ] Loading/empty/error states for every async view (some views render blank while polling).
- [ ] Persist sidebar/view state across reloads (theme already persists).

## Standing constraints (apply to every task)

1. Synthetic-only milestone holds: no real First Nations/Indigenous/community data, no wording implying real provenance (roadmap non-negotiable gate).
2. Public DTOs stay privacy-preserving: no `expectedAnswers`, `gradingExplanation`, learner `answer`/`learnerId`, reviewer internals, or answer-key provenance.
3. No static dev tokens or privileged selectors in the browser bundle; HttpOnly prototype-session cookies only.
4. TDD: failing test first, then implementation; every task ends with `npm run check`, `npm test`, `npm run build`, and `git diff --check`.
5. Corpus/schema/seed/eval changes also require `npm run seed` + `npm run eval` before completion.

## Suggested execution order

Wave 1 tasks are independent and parallelizable via worktrees + subagents (see `references/production-readiness-wave1-execution.md` pattern). Wave 2 depends on Wave 1 Task 1 (baselines build on draft scoring). Wave 3 can interleave anytime.
