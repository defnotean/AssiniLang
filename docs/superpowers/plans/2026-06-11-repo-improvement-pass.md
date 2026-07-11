# Repo Improvement Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve maintainability by extracting focused modules from oversized API, DB, and frontend files without changing user-facing behavior.

**Architecture:** Keep the current Fastify, React, Zod, and JSON-store architecture. This pass extracts pure helpers and view logic first, leaving route behavior, API payloads, schemas, and UI workflows stable.

**Tech Stack:** TypeScript, React 19, Vite, Fastify, Zod, Vitest, npm workspaces.

---

## Task 1: Frontend Evaluation Utilities

**Files:**

- Create: `apps/web/src/evaluationTrends.ts`
- Create: `apps/web/src/evaluationTrends.test.ts`
- Modify: `apps/web/src/App.tsx`

- [x] Write tests for `averageScore`, `latestRunsByLanguage`, and `evaluationTrendsForRuns` using plain `EvaluationRun`-shaped fixtures.
- [x] Run `npm.cmd test -- apps/web/src/evaluationTrends.test.ts` and verify the new module import fails before implementation.
- [x] Move the pure evaluation trend helpers out of `App.tsx` into `evaluationTrends.ts`.
- [x] Import the helpers from `App.tsx`.
- [x] Run `npm.cmd test -- apps/web/src/evaluationTrends.test.ts apps/web/src/App.test.tsx`.

## Task 2: DB Audit Metadata Privacy Module

**Files:**

- Create: `packages/db/src/auditMetadataPrivacy.ts`
- Create: `packages/db/src/auditMetadataPrivacy.test.ts`
- Modify: `packages/db/src/schema.ts`

- [x] Write tests for private audit metadata key detection and secret-looking string detection.
- [x] Run `npm.cmd test -- packages/db/src/auditMetadataPrivacy.test.ts` and verify the missing module fails before implementation.
- [x] Move audit metadata privacy helpers from `schema.ts` into `auditMetadataPrivacy.ts`.
- [x] Import `auditMetadataPrivacyIssue` into `schema.ts` and keep persisted validation messages unchanged.
- [x] Run `npm.cmd test -- packages/db/src/auditMetadataPrivacy.test.ts packages/db/src/store.test.ts`.

## Task 3: API Request Parsing Boundary

**Files:**

- Create: `apps/api/src/requestParsing.ts`
- Create: `apps/api/src/requestParsing.test.ts`
- Modify: `apps/api/src/server.ts`

- [x] Write tests for language creation parsing, language patch parsing, source registration parsing, and prototype session body parsing.
- [x] Run `npm.cmd test -- apps/api/src/requestParsing.test.ts` and verify the missing module fails before implementation.
- [x] Move pure request-body parsing helpers and related body types into `requestParsing.ts`.
- [x] Import the parsers/types into `server.ts` without changing route behavior.
- [x] Run `npm.cmd test -- apps/api/src/requestParsing.test.ts apps/api/src/server.test.ts`.

## Task 4: Integration Verification

**Files:**

- Modify as needed only for imports and type fixes.

- [x] Run `npm.cmd test`.
- [x] Run `npm.cmd run check`.
- [x] Run `npm.cmd run build`.
- [x] Run `npm.cmd run smoke`.
- [x] Run `npm.cmd audit --json`.
- [x] Review `git diff --check` and `git status --short --branch`.
