# Audit / export drill walkthrough

Operator-facing local drill for the review-accountability pack: export a sanitized language snapshot and evaluation artifact, confirm SHA-256 integrity and redaction, and verify audit receipts. Use only synthetic fixtures — never real community language material.

Related: [Operator Recovery Runbook](operator-recovery.md), [API — sanitized exports](api.md#sanitized-exports), [Product Guide — export surfaces](product-guide.md#export-surfaces), [Roadmap — review accountability pack](roadmap.md#next-milestone-reviewer-ready-local-beta).

## What you prove

| Check | Pass criteria |
| --- | --- |
| Snapshot export | `exportVersion` is `language-snapshot-v2`; integrity verifies; private fields absent |
| Evaluation artifact | `exportVersion` is `evaluation-artifact-v2`; integrity verifies; private fields absent |
| Audit receipts | `language_snapshot.exported` and `evaluation_artifact.exported` appear with `contentHash` metadata (not private payload) |
| Golden fixtures | Committed samples under `fixtures/exports/` stay redacted and signed |

## Fixtures and automated guard

| Artifact | Path |
| --- | --- |
| Language snapshot sample | `fixtures/exports/language-snapshot.sample.json` |
| Evaluation artifact sample | `fixtures/exports/evaluation-artifact.sample.json` |
| Redaction / integrity tests | `scripts/reviewAccountability.test.ts` |

Run the fixture guard first (no server required):

```powershell
npx vitest run scripts/reviewAccountability.test.ts
```

Expect all tests green: golden samples match live builders from the accountability workspace, omit answer keys / learner answers / AI sessions / users, and pass `verifyExportIntegrity`.

## Prerequisites

1. Dev stack running (`npm.cmd run dev`) with prototype auth enabled (the launcher sets `ASSINI_ENABLE_PROTOTYPE_AUTH=true`).
2. A workspace that includes the seeded Testlang language (`id: testlang`). Fresh checkouts: `npm.cmd run seed` then restart if needed.
3. Server-token auth for curl: `x-assini-user-id` plus `x-assini-dev-token` matching `ASSINI_DEV_AUTH_TOKEN` (default `dev-local` from `.env.example`).

Optional UI path (same receipts): Settings → Governance → **Download snapshot JSON**; Settings → Checks → **Export evaluation artifact** / **Download evaluation artifact JSON**. The steps below use curl so the drill is scriptable.

## Step-by-step local drill

Replace `$PORT` with the API port (default `8787`). PowerShell:

### 1. Confirm readiness

```powershell
curl.exe -sS "http://127.0.0.1:$PORT/ready"
```

Expect a ready response before exporting.

### 2. Export the language snapshot

```powershell
curl.exe -sS -D - `
  -H "x-assini-user-id: reviewer-1" `
  -H "x-assini-dev-token: dev-local" `
  "http://127.0.0.1:$PORT/exports/languages/testlang/snapshot" `
  -o "$env:TEMP\assini-testlang-snapshot.json"
```

Pass checks:

- HTTP `200`
- `Cache-Control: no-store` (and `Pragma: no-cache`)
- `Content-Disposition` attachment filename for the snapshot
- Body `exportVersion` is `language-snapshot-v2`
- Body `integrity.algorithm` is `sha256`, `generatedBy` is `assini-local-export-v1`
- Body has no `expectedAnswers`, learner answers, AI sessions, or local users

Compare shape to `fixtures/exports/language-snapshot.sample.json` (live `exportedAt` / hashes differ; redaction policy and version must match).

### 3. Export the evaluation artifact

```powershell
curl.exe -sS -D - `
  -H "x-assini-user-id: reviewer-1" `
  -H "x-assini-dev-token: dev-local" `
  "http://127.0.0.1:$PORT/exports/evaluations/artifact" `
  -o "$env:TEMP\assini-evaluation-artifact.json"
```

Pass checks:

- HTTP `200`, `Cache-Control: no-store`, attachment filename `assini-evaluation-artifact.json`
- Body `exportVersion` is `evaluation-artifact-v2`
- Integrity fields present as above
- Empty / no-run workspaces still export with `summary.passed: false` (not a vacuous green gate)

Compare redaction policy and version to `fixtures/exports/evaluation-artifact.sample.json`.

### 4. Verify integrity offline

From the repo root:

```powershell
npx tsx -e "import { readFile } from 'node:fs/promises'; import { verifyExportIntegrity } from './apps/api/src/publicLanguageViews.ts'; const snap = JSON.parse(await readFile(process.env.TEMP + '/assini-testlang-snapshot.json','utf8')); const art = JSON.parse(await readFile(process.env.TEMP + '/assini-evaluation-artifact.json','utf8')); console.log('snapshot', verifyExportIntegrity(snap)); console.log('artifact', verifyExportIntegrity(art));"
```

Expect both lines `true`. Tampering any payload field without updating the hash must fail verification. As a no-server fallback, `npx vitest run scripts/reviewAccountability.test.ts` exercises the same `verifyExportIntegrity` path against the golden fixtures.

### 5. Confirm audit receipts

```powershell
curl.exe -sS `
  -H "x-assini-user-id: programmer-1" `
  -H "x-assini-dev-token: dev-local" `
  "http://127.0.0.1:$PORT/audit/events?languageId=testlang"
```

Also fetch unfiltered events (evaluation artifact receipts are workspace-scoped, `languageId: null`):

```powershell
curl.exe -sS `
  -H "x-assini-user-id: programmer-1" `
  -H "x-assini-dev-token: dev-local" `
  "http://127.0.0.1:$PORT/audit/events"
```

Pass checks:

- An event with `action: "language_snapshot.exported"` for `testlang`, metadata including `exportVersion: "language-snapshot-v2"`, `algorithm: "sha256"`, and `contentHash` matching the snapshot file
- An event with `action: "evaluation_artifact.exported"`, metadata including `exportVersion: "evaluation-artifact-v2"` and the artifact `contentHash`
- Audit metadata does **not** contain answer keys, learner answers, prompts, or API keys

### 6. Negative check (optional)

```powershell
curl.exe -sS -w "\nHTTP %{http_code}\n" `
  -H "x-assini-user-id: reviewer-1" `
  -H "x-assini-dev-token: dev-local" `
  "http://127.0.0.1:$PORT/exports/languages/not-a-language/snapshot"
```

Expect HTTP `404` with `i18nKey: "errors.languageNotFound"` and **no** new `language_snapshot.exported` audit event.

## Drill log template

Copy into the acceptance pack when recording a timed run:

```text
Date:
Operator:
API port / commit:
reviewAccountability.test.ts: pass / fail
Snapshot exportVersion / contentHash:
Artifact exportVersion / contentHash:
language_snapshot.exported seen: yes / no
evaluation_artifact.exported seen: yes / no
Integrity verify (both): pass / fail
Notes:
```

## Out of scope

Acceptance-pack screenshots of the Governance / Checks download UI remain a separate roadmap artifact. Production export retention, external review receipts, and tamper-evident long-term audit storage are not part of this local drill.
