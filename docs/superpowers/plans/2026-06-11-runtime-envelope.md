# Runtime Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the API production-runnable from built JavaScript and add validated runtime configuration plus graceful shutdown.

**Architecture:** Keep Fastify route behavior unchanged. Split startup configuration and lifecycle wiring into focused modules so `index.ts` only loads env, builds config, creates the server, starts listening, and registers shutdown handlers. Package metadata should point production entrypoints at `dist/` while development still uses `tsx`.

**Tech Stack:** TypeScript, npm workspaces, Fastify, Vitest, Node child-process/runtime metadata checks.

---

## Task 1: Production Package Metadata

**Files:**
- Modify: `apps/api/package.json`
- Modify: `packages/db/package.json`
- Modify: `packages/eval/package.json`
- Create/Modify: `scripts/repositoryHygiene.test.ts`

- [x] Add failing repository hygiene tests that assert API, DB, and eval `main` fields point to `dist/index.js`.
- [x] Add failing repository hygiene tests that assert `@assini/api` `start` is `node dist/index.js` and does not mention `tsx`.
- [x] Run `npm.cmd test -- scripts/repositoryHygiene.test.ts` and confirm the new assertions fail.
- [x] Update package metadata.
- [x] Rerun `npm.cmd test -- scripts/repositoryHygiene.test.ts`.

## Task 2: Runtime Config Parser

**Files:**
- Create: `apps/api/src/runtimeConfig.ts`
- Create: `apps/api/src/runtimeConfig.test.ts`
- Modify: `docs/configuration.md`
- Modify: `.env.example`

- [x] Add tests for default config: host `127.0.0.1`, port `4321`, default CORS origins, body limit `65536`, logger disabled.
- [x] Add tests for env overrides: `HOST`, `PORT`, `ASSINI_ALLOWED_ORIGINS`, `ASSINI_BODY_LIMIT_BYTES`, and `ASSINI_API_LOGGER`.
- [x] Add tests that invalid numeric env values throw clear startup errors.
- [x] Run `npm.cmd test -- apps/api/src/runtimeConfig.test.ts` and confirm missing module failure.
- [x] Implement `readRuntimeConfig(env)`.
- [x] Document the new env variables.

## Task 3: Startup Lifecycle

**Files:**
- Create: `apps/api/src/runtimeLifecycle.ts`
- Create: `apps/api/src/runtimeLifecycle.test.ts`
- Modify: `apps/api/src/index.ts`

- [x] Add tests that `registerShutdownHandlers` calls `app.close()` on `SIGINT` and `SIGTERM`.
- [x] Add tests that multiple signals only close once.
- [x] Run `npm.cmd test -- apps/api/src/runtimeLifecycle.test.ts` and confirm missing module failure.
- [x] Implement `registerShutdownHandlers`.
- [x] Update `index.ts` to use `readRuntimeConfig`, pass `allowedOrigins` and `bodyLimitBytes` into `createServer`, and register shutdown handlers.

## Task 4: Built Startup Smoke

**Files:**
- Modify: `scripts/repositoryHygiene.test.ts` or create focused runtime smoke test if needed.

- [x] Run `npm.cmd run build`.
- [x] Run `npm.cmd --workspace @assini/api run start` with a temporary `ASSINI_DB_PATH` and alternate `PORT`, verify `GET /health`, then terminate the process.
- [x] Keep this as a documented manual verification in the plan unless it is stable enough to automate without slowing CI.

## Task 5: Verification

**Files:**
- Modify as needed only for type or doc fixes.

- [x] Run `npm.cmd test`.
- [x] Run `npm.cmd run check`.
- [x] Run `npm.cmd run build`.
- [x] Run `npm.cmd run smoke`.
- [x] Run `npm.cmd run verify`.
- [x] Run `npm.cmd audit --json`.
- [x] Run `git diff --check`.
