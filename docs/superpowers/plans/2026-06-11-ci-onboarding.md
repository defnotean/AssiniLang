# CI and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal CI quality gate and non-secret environment template so production-readiness checks do not depend on manual memory.

**Architecture:** Keep the local `npm run verify` script as the source of truth. Add a GitHub Actions workflow that installs with `npm ci`, runs the verifier, runs the smoke test, and runs `npm audit --audit-level=moderate`. Add `.env.example` as documentation-by-example with safe placeholder values only.

**Tech Stack:** GitHub Actions, npm workspaces, Vitest repository hygiene tests.

---

## Task 1: Repository Hygiene Tests

**Files:**
- Create: `scripts/repositoryHygiene.test.ts`

- [x] Write a failing test that expects `.github/workflows/ci.yml` to exist and contain `npm ci`, `npm run verify`, `npm run smoke`, and `npm audit --audit-level=moderate`.
- [x] Write a failing test that expects `.env.example` to exist, include core `ASSINI_*` variables from `docs/configuration.md`, and avoid real secret-looking values.
- [x] Run `npm.cmd test -- scripts/repositoryHygiene.test.ts` and confirm it fails because the files are missing.

## Task 2: CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [x] Add a workflow named `CI` for pushes and pull requests to `master`.
- [x] Use `actions/checkout@v4` and `actions/setup-node@v4` with Node `20.19.x` and npm cache.
- [x] Run `npm ci`, `npm run verify`, `npm run smoke`, and `npm audit --audit-level=moderate`.

## Task 3: Environment Example

**Files:**
- Create: `.env.example`
- Modify: `docs/configuration.md`

- [x] Add commented safe examples for deterministic mode, local model mode, transcription, OCR, ports, DB path, and prototype auth.
- [x] Keep secret variables blank or placeholder-only, never real-looking tokens.
- [x] Mention `.env.example` in `docs/configuration.md`.

## Task 4: Verification

**Files:**
- Modify as needed only for test or doc fixes.

- [x] Run `npm.cmd test -- scripts/repositoryHygiene.test.ts scripts/documentation.test.ts`.
- [x] Run `npm.cmd test`.
- [x] Run `npm.cmd run check`.
- [x] Run `npm.cmd run build`.
- [x] Run `npm.cmd run smoke`.
- [x] Run `npm.cmd audit --json`.
- [x] Run `git diff --check`.
