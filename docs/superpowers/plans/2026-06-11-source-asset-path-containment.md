# Source Asset Path Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent persisted source-asset file paths from escaping the configured data directory.

**Architecture:** Enforce the invariant at both persisted-state validation and runtime path resolution. File-backed assets must use canonical `assets/<languageId>/...` paths; absolute paths, drive/UNC paths, URL-like paths, backslashes, traversal, and wrong-language prefixes are rejected before ingestion reads files.

**Tech Stack:** TypeScript, Zod app-state validation, Vitest, Fastify ingestion pipeline.

---

## Task 1: Persisted-State Regression Tests

**Files:**
- Modify: `packages/db/src/store.test.ts`

- [x] Add source-asset fixtures with a valid `assets/avenik/source-1__notes.txt` path.
- [x] Add failing parse tests for POSIX absolute paths, Windows absolute paths, UNC paths, URL-like paths, `..`, wrong language prefixes, and missing `assets/` prefixes.
- [x] Run `npm.cmd test -- packages/db/src/store.test.ts apps/api/src/ingestion.test.ts -t "filePath|unsafe persisted file paths"` and confirm the DB cases fail before implementation.

## Task 2: Runtime Ingestion Regression Tests

**Files:**
- Modify: `apps/api/src/ingestion.test.ts`

- [x] Add a failing extraction test where `filePath: "../outside.txt"` would otherwise read outside `dataDir`.
- [x] Add a failing extraction test where an absolute temp-file path would otherwise read outside `dataDir`.
- [x] Confirm both tests fail by resolving to real candidates before the fix.

## Task 3: Shared Path Guard

**Files:**
- Create: `packages/db/src/sourceAssetPaths.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/src/schema.ts`
- Modify: `apps/api/src/ingestion.ts`

- [x] Add `sourceAssetFilePathIssue(filePath, languageId)` for persisted-state validation.
- [x] Add `resolveSourceAssetFilePath(dataDir, filePath, languageId)` for ingestion reads.
- [x] Export the helper through `@assini/db`.
- [x] Call the validator from `addSourceAssetIntegrityIssues`.
- [x] Replace direct `resolve(dataDir, asset.filePath)` reads in ingestion with the shared resolver.

## Task 4: Positive Coverage and Docs

**Files:**
- Modify: `apps/api/src/ingestion.test.ts`
- Modify: `docs/architecture.md`

- [x] Update legitimate file-backed test fixtures to use `assets/<languageId>/...`.
- [x] Run `npm.cmd test -- packages/db/src/store.test.ts apps/api/src/ingestion.test.ts`.
- [x] Document the persisted path invariant in `docs/architecture.md`.

## Task 5: Verification

**Files:**
- Modify as needed only for type or doc fixes.

- [x] Run `npm.cmd test`.
- [x] Run `npm.cmd run check`.
- [x] Run `npm.cmd run build`.
- [x] Run `npm.cmd run smoke`.
- [x] Run `npm.cmd audit --json`.
- [x] Run `git diff --check`.

## Task 6: Review Follow-Ups

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/store.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`

- [x] Reject persisted language IDs that are not safe slug/path segments.
- [x] Validate upload storage paths with `resolveSourceAssetFilePath` before `mkdir` or `writeFile`.
- [x] Make redacted source-processing failures audit-safe by removing API-key and bearer markers from stored strings.
- [x] Add regression coverage for unsafe language IDs and audit-safe source-processing failures.
- [x] Rerun focused API/DB tests and full verification.
