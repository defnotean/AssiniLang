# Local incident response runbook

This runbook covers the repository-supported, single-device AssiniLang research console. It does not assume an external monitoring service, remote log collector, production authentication system, or real community language data. For restore mechanics and acceptance drills, use the [Operator Recovery Runbook](operator-recovery.md).

## First five minutes

1. Stop new imports and model experiments. Do not delete, reseed, or hand-edit the workspace.
2. Check `GET /health`. A `200 { "ok": true }` means only that the API event loop can answer; it does not prove storage or recovery is healthy.
3. Check `GET /ready`. A `200` requires validated storage, an inspectable job queue, and a successful startup-recovery pass. A `503` contains only fixed, sanitized check results.
4. As a local programmer, lead, or admin actor, capture `GET /observability/metrics`. Record the response and the failing request's `x-request-id` header.
5. Create a validated database backup before destructive investigation. Use `npm.cmd run db:backup` or the desktop **Create backup** action.

Never attach `.env`, cookies, authorization headers, the raw database, uploaded source files, prompts, learner answers, provider responses, or unredacted terminal output to an issue. The metrics endpoint deliberately contains none of those values.

## Signal interpretation

| Signal                                                         | Meaning                                                                               | First action                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/health` fails                                                | API process is stopped, wedged, or unreachable.                                       | Preserve the terminal output, restart once, then recheck `/ready`.                                                                |
| `/health` is `200`, `/ready` says `Storage read failed`        | The process is live but the configured workspace cannot be read and schema-validated. | Stop writes; follow the corrupt-database or restore procedure.                                                                    |
| `/ready` says `Job queue status unavailable`                   | Queue diagnostics are not trustworthy.                                                | Restart once; if it repeats, preserve sanitized diagnostics and treat async processing as unavailable.                            |
| `/ready` says `Startup recovery pending`                       | Startup has not completed the interrupted-job sweep.                                  | Wait briefly and retry. Do not send mutations yet.                                                                                |
| `/ready` says `Startup recovery failed`                        | Interrupted processing rows may not have been reclaimed.                              | Stop async ingestion; back up; inspect storage health; restart only after resolving the storage/update failure.                   |
| `requests.errors.server` or `requests.byStatusClass.5xx` rises | One or more requests reached an internal failure.                                     | Correlate the time with a sanitized `request.unhandled` log event and its `requestId`; do not collect request bodies.             |
| Latency shifts into `le1000` or `gt1000`                       | Requests are taking longer, without revealing which route or content was involved.    | Check local CPU/disk pressure and whether model/OCR work is running; compare with job queue depth.                                |
| `jobs.failed` rises                                            | A queued source-processing function rejected.                                         | Inspect the affected source's safe persisted error in the UI and audit history; job logs intentionally omit the id and exception. |
| `jobs.duplicateRejected` rises                                 | The same source was submitted while already pending or active.                        | Refresh source status; do not repeatedly retry.                                                                                   |
| `recovery.staleSweep.failures` rises or status is `failed`     | Live stale-heartbeat recovery could not complete.                                     | Stop new async ingestion, back up, restart once, then verify `/ready` and the recovery snapshot.                                  |
| `recovery.*.totalRecovered` or startup `recovered` is nonzero  | Orphaned processing rows were safely moved to `failed`.                               | Confirm the `source_asset.processing_recovered` audit event, then deliberately reprocess the source.                              |

Request latency buckets are inclusive at 10, 50, 250, and 1,000 milliseconds; values above 1,000 milliseconds use `gt1000`. Averages are integer milliseconds. Metrics are process-lifetime aggregates and reset on restart; they are diagnostics, not an SLA or durable audit record.

## Safe structured log events

When `ASSINI_API_LOGGER=true`, operational events use fixed event names and aggregate numeric fields:

- `job.enqueued`, `job.started`, `job.completed`, `job.failed`, `job.cancelled`, `job.cancel_rejected`, `job.duplicate_rejected`
- `recovery.startup_completed`, `recovery.startup_failed`, `recovery.stale_sweep_completed`, `recovery.stale_sweep_failed`
- `request.unhandled`

Job events contain queue counts and, after completion, duration. They do not contain job/source ids, source titles, filesystem paths, provider error bodies, or thrown exceptions. Recovery failure events do not contain the underlying exception. `request.unhandled` contains only a fixed event name, HTTP status, and request id. Redaction remains defense in depth for authorization, cookies, API-key fields, and error message/stack/cause fields.

## Incident procedures

### Repeated internal errors

1. Capture the sanitized metrics snapshot and one response `x-request-id`.
2. Reproduce once with the smallest local, synthetic fixture. Do not use real community data.
3. If the error is model-related, use **Test connection** and capture only its redacted status/detail.
4. If the error is storage-related, stop writes and run the restore validation steps before retrying.
5. File an issue with app version/commit, OS, operation category, timestamps, request id, sanitized metrics, and reproduction steps.

### Queue growth or stuck processing

1. Compare `jobQueue.pending`/`active` with `jobs.enqueued`/`completed`/`failed`.
2. Wait for active work to finish; cancel only pending work through the supported API/UI.
3. The live stale-heartbeat sweep reclaims orphaned rows after the configured ten-minute stale threshold while skipping ids still pending or active.
4. If the sweep reports failure, stop new work and restart once. Startup recovery must become `succeeded` before `/ready` returns `200`.
5. Confirm recovered assets are `failed`, have a recovery audit event, and are reprocessed deliberately.

### Suspected data corruption

1. Stop the API before copying files.
2. Preserve the original workspace privately and create or locate a validated backup.
3. Never paste raw database validation errors into a public issue; local paths and content may be present.
4. Restore through `JsonStore.restoreFrom` or the desktop restore action, which validates before replacement and creates a safety copy.
5. Confirm `/ready`, language/source counts, and audit history before resuming mutations.

## Closure checklist

- `/health` and `/ready` are both healthy.
- Recovery startup status is `succeeded`; the stale sweep is not `failed`.
- Queue pending/active counts return to the expected local baseline.
- A validated post-recovery backup exists.
- Any recovered source has its audit event and deliberate retry outcome.
- The incident note contains only sanitized metrics, request ids, timestamps, synthetic reproduction details, and the corrective action.

If resolution needs deployment, external coordination, production identity/policy decisions, or real community data, stop. Those are explicit blockers outside this repository-local runbook, not permissions to improvise production policy.
