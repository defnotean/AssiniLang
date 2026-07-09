# Readiness Endpoint Implementation Plan

> **Status: historical and shipped.** This file preserves the original implementation intent and schema-version examples. Use the [API reference](../../api.md), [architecture guide](../../architecture.md), and [current roadmap](../../roadmap.md) for current facts.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-style readiness endpoint that verifies API persistence can be read and schema-validated without leaking local paths or stored data.

**Architecture:** Keep `/health` as the cheap liveness probe. Add `/ready` as a deeper readiness probe backed by a focused helper in `apps/api/src/readiness.ts`; the route calls the same `readState` boundary used by normal API reads. Responses expose only readiness status and schema version, never database paths, exception messages, or workspace record contents.

**Tech Stack:** TypeScript, Fastify, Vitest, Zod-backed `JsonStore`.

---

## Task 1: Readiness Report Helper

**Files:**
- Create: `apps/api/src/readiness.ts`
- Create: `apps/api/src/readiness.test.ts`

- [x] Write a failing test that imports `createReadinessReport` and expects a successful read to return:

```ts
{
  ok: true,
  checks: {
    storage: {
      ok: true,
      schemaVersion: 8
    }
  }
}
```

- [x] Write a failing test that passes a reader throwing `new Error("Failed to read C:/secret/local-db.json")` and expects:

```ts
{
  ok: false,
  checks: {
    storage: {
      ok: false,
      error: "Storage read failed"
    }
  }
}
```

- [x] Run `npm.cmd test -- apps/api/src/readiness.test.ts` and confirm it fails because `./readiness` does not exist.
- [x] Implement `createReadinessReport(readState)` in `apps/api/src/readiness.ts`.
- [x] Run `npm.cmd test -- apps/api/src/readiness.test.ts` and confirm both tests pass.

## Task 2: `/ready` API Route

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`

- [x] Add failing server tests:

```ts
const ready = await app.inject({ method: "GET", url: "/ready" });
expect(ready.statusCode).toBe(200);
expect(ready.json()).toMatchObject({ ok: true, checks: { storage: { ok: true, schemaVersion: 8 } } });
```

```ts
await writeFile(dbPath, "{ not valid json", "utf8");
const app = createServer({ store: new JsonStore(dbPath) });
const ready = await app.inject({ method: "GET", url: "/ready" });
expect(ready.statusCode).toBe(503);
expect(ready.json()).toEqual({ ok: false, checks: { storage: { ok: false, error: "Storage read failed" } } });
expect(JSON.stringify(ready.json())).not.toContain(dbPath);
```

- [x] Run `npm.cmd test -- apps/api/src/server.test.ts -t ready` and confirm the route test fails with `404`.
- [x] Import `createReadinessReport` in `server.ts`.
- [x] Register `GET /ready`; return `503` when the report is not ok.
- [x] Run `npm.cmd test -- apps/api/src/readiness.test.ts apps/api/src/server.test.ts -t ready` and confirm the readiness tests pass.

## Task 3: Documentation

**Files:**
- Modify: `docs/api.md`

- [x] Add `GET /ready` to the route index as a public readiness check.
- [x] Explain that `/health` is liveness and `/ready` validates readable schema-backed persistence.
- [x] Run `npm.cmd test -- scripts/documentation.test.ts`.

## Task 4: Verification

**Files:**
- Modify as needed only for type or doc fixes.

- [x] Run `npm.cmd test`.
- [x] Run `npm.cmd run check`.
- [x] Run `npm.cmd run build`.
- [x] Run `npm.cmd run smoke`.
- [x] Run `npm.cmd audit --json`.
- [x] Run `git diff --check`.
- [x] Review `git status --short --branch`.
