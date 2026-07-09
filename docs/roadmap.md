# Roadmap

AssiniLang is a capable local-first prototype for synthetic and user-created test data. It is still **not** ready for real First Nations, Indigenous, or community language material. This roadmap reflects the current implemented state after the June 2026 uplift and names the remaining production blockers.

## Closed or implemented

These are no longer active roadmap gaps:

- **Source ingestion:** text, word-list, URL, image, audio, PDF, and DOCX sources; chunked long-source processing; synchronous or background processing with polling; SSRF-guarded URL fetches; PDF/DOCX text extraction; image OCR fallback; audio transcription path; duplicate and grounding flags on extraction drafts.
- **Interrupted processing recovery:** startup now sweeps sources left in `processing`, marks them `failed` with an operator-visible error, appends an audit event, and allows the source to be processed again. This prevents permanently stuck processing records after a crash or restart.
- **Draft review scale:** extraction drafts support both single-item review and bulk accept/reject through the API and web queue, including per-item partial-failure reporting and redacted public DTOs.
- **Review/governance prototype:** local governance records, per-language review policies, assigned reviewers, approval thresholds, review dispositions, elder corrections, and audit events are implemented for prototype workflows.
- **Model-assisted authoring:** grounded model draft routes exist for grammar notes (`POST /languages/:languageId/study-loop/model-draft`) and exercises (`POST /languages/:languageId/exercises/generate`). Generated content is constrained to approved lexicon/corpus data and still goes through human review or author save paths; answer keys remain server-side and human-controlled.
- **Model-draft scoring:** model-generated note drafts receive deterministic grounding scores and failure details, and evaluation runs use persisted model-draft notes when present instead of only answer-key-derived baseline drafts.
- **Model setup and corpus visualization:** Settings can discover local/OpenAI-compatible model endpoints, save named model profiles, hot-swap the active provider without restarting, test reachability separately from static readiness, and surface stale/unloaded saved models. The examples browser now includes a role-gated corpus graph over passages, morphemes, topics, sources, notes, exercises, AI sessions, and elder corrections.
- **Learning/evaluation basics:** server-graded exercises with private answer keys, adversarial probe checks, practice recommendations, deterministic evaluation categories, evaluation trends, and paradigm-gap detection are implemented for the local harness.
- **Local persistence:** JSON and SQLite-backed local stores exist. SQLite now has a `schema_meta` version stamp and a transactional migration runner for future schema bumps.
- **Backup/restore:** `backupTo` / `restoreFrom` exist for both JSON and SQLite stores, restore validates before replacing live data, and `npm run db:backup` writes validated local backups.
- **Runtime and CI envelope:** validated runtime config, graceful startup/shutdown seams, `/health`, `/ready`, built-dist startup smoke, `npm run verify`, `npm run smoke`, Windows/Linux CI matrix, and an `npm audit` CI gate are in place.

## Continuous improvement log

Recent local-first improvements (prototype scope — not production claims):

- **Dedicated OCR model settings (June 2026):** `ASSINI_OCR_BASE_URL`, `ASSINI_OCR_MODEL`, and `ASSINI_OCR_API_KEY` configure a separate vision endpoint for image sources; keys are write-only in settings and redacted from errors, audit metadata, and exports (`auditMetadataPrivacy`, `secretRedaction`).
- **Scanned PDF page-1 OCR (June 2026):** when an OCR model is configured, PDFs with no embedded text attempt page-1 raster OCR before failing; DOCX and multi-page scanned documents are still out of scope.
- **Lexicon longest-match segmentation (June 2026):** extraction-draft acceptance tries lexicon-based morpheme proposals before falling back to `unanalyzed` tokens; quality is heuristic and still needs reviewer validation tooling.
- **Corpus import dry-run (June 2026):** `POST /languages/:languageId/corpus?dryRun=1` (or body `dryRun: true`) validates a passage without persisting; TSV/CSV bulk dry-run remains unshipped.
- **Processing heartbeats and attempts (June 2026):** source assets persist `processingStartedAt`, `processingHeartbeatAt`, and `processingAttempts` during async processing and interrupted-job recovery; chunk-level resumability and automatic retry policy are still absent.
- **Source processing max-attempt cap (June 2026):** `POST /sources/:id/process` returns `409` with a localized message after five failed attempts; operators must review the source error before manual retry.
- **Humanized processing heartbeat age (July 2026):** the Build source list shows a relative “last progress” label from `processingHeartbeatAt` (or `processingStartedAt`) while a source is processing.
- **Model-draft grounding failure codes (July 2026):** model-backed note drafts persist `groundingScore` and `groundingFailureCodes` on `note.draft_generated` audit events; response payloads still include full grounding checks without widening the note schema.
- **Eval baseline and verify gate (June 2026):** `fixtures/eval/testlang-baseline.json` retains deterministic Testlang scores; `npm run verify:beta` documents and optionally runs model verification when `ASSINI_VERIFY_MODEL=1`.
- **Operator safety polish (June–July 2026):** `ConfirmDialog` guards destructive actions, backup CLI supports `--dry-run`, AI session writes enforce role policy, Obsidian vault import paths are CI-tested, and RTL layout has regression coverage.
- **Local-beta UX polish (July 2026):** corpus validate dry-run notices mirror exercise authoring, phonology empty states include workflow hints, AssiniLang Desktop surfaces offline/reconnect guidance when the embedded API is unreachable, review-queue empty states include Build next-step hints, evaluation/governance exports and Settings save success announce through aria-live status regions, Settings save failures use assertive aria-live, Build intake empty states and no-language notices include next-step guidance, Elder correction submit is busy-disabled while in flight, Build localizes multi-page PDF OCR warnings and empty-DOCX OCR-unsupported errors, Build source/draft count headings use i18n plural keys, Settings connection-test reachability strings and smoke-test empty replies are localized, Chat/Build/Checks busy actions expose `aria-busy` while in flight, Practice submission status and header orthography labels are localized, Chat empty-state includes a next-step hint with assertive create-error alerts, Examples/Review busy import-validate and note-save actions expose `aria-busy`, Checks trend/metric/mode labels and Rules disposition/audit empty states are localized with export/resolve `aria-busy`, and Settings provider smoke/connection tests expose `aria-busy`.

## Partial or prototype-only capabilities

These features are useful locally but are not production-ready:

- **Governance and consent:** the app can record local governance/provenance data, but it does not provide legally or community-enforceable consent, licensing, data-sharing, or AI-use workflows.
- **Accounts and membership:** prototype sessions, local users, and role checks exercise review behavior, but there is no production authentication, identity proofing, community/project membership binding, or invitation/offboarding flow.
- **Access control:** routes and public projections redact sensitive fields, but there is no production policy engine for language-, role-, source-, purpose-, or community-specific access decisions.
- **Background jobs:** interrupted jobs are no longer stuck forever and now persist heartbeat timestamps and attempt counts; processing stops after five operator-visible attempts, but jobs are not durable/resumable at chunk level and lack automatic backoff retry beyond the attempt cap.
- **Document OCR:** images have OCR fallback (dedicated OCR model, vision LLM, or tesseract), PDFs/DOCX with embedded text parse normally, and scanned PDFs can use page-1 OCR when `ASSINI_OCR_BASE_URL` is set; full-document and DOCX OCR remain unshipped.
- **Morphology/segmentation quality:** lexicon longest-match segmentation reduces but does not eliminate `unanalyzed` morphemes; better proposals, conflict resolution, and validation tooling are still needed.
- **Model-draft evaluation:** grounding scores and model-draft evaluation paths exist, and the Testlang deterministic baseline is now retained in `fixtures/eval/testlang-baseline.json`; per-draft failure codes persist on audit events, but scores are not yet retained as a durable provider/model artifact, there is no uncertainty taxonomy beyond failure strings, and there are no named provider regression baselines.
- **Evaluation scale:** the deterministic harness is useful but small; it needs broader fixtures, retained baselines, regression exports, and adversarial probes across more user-created languages.
- **Authoring UX:** compact corpus import, single-passage corpus dry-run validation, exercise authoring, model exercise drafts, and note explanation edits exist. Rich structured note/example editing, N-probe exercise authoring, dry-run TSV/CSV bulk imports, and broader pre-save validation previews remain incomplete.
- **Operations:** SQLite migrations and backup/restore are implemented for the local store, but there is no production database target, retention policy, disaster-recovery drill, or operational runbook for real data.
- **Observability/security:** AI-session observability, audit events, request-id correlation, and a green dependency-audit gate exist, but production metrics, secrets management, rate-limit policy, security review, and incident response are not complete.

## Next milestone: reviewer-ready local beta

Before treating AssiniLang as a stable local beta for non-sensitive synthetic or user-created data, ship these checkable artifacts:

1. **Workflow acceptance pack:** desktop smoke screenshots for Start, Build, Practice, and Settings at desktop/tablet/mobile widths, including empty states, long model names, and graph mode.
2. **Model operations pack (partial — baseline + opt-in gate shipped):** `fixtures/eval/testlang-baseline.json` and `packages/eval/src/testlangBaseline.test.ts` retain deterministic Testlang evaluation scores; `npm.cmd run verify:beta` documents and optionally runs `model:verify` when `ASSINI_VERIFY_MODEL=1`. Remaining artifacts: one local-model verification report, one saved-profile switch test, one unloaded-model stale-state test, and documented timeout/max-token recommendations for slow local models.
3. **Corpus intake pack (partial — vault fixture shipped):** `fixtures/obsidian-vault/` plus `apps/api/src/obsidianVaultFixture.test.ts` cover committed vault import, empty-note skip, and imported-note counts; `server.test.ts` covers allowlist failures (unset roots, outside-root paths). Remaining artifacts: bulk source-processing fixture, graph-rendering fixture, and oversized-import failure examples.
4. **Review accountability pack (partial — samples + redaction tests shipped):** `fixtures/exports/language-snapshot.sample.json` and `evaluation-artifact.sample.json` with `scripts/reviewAccountability.test.ts`; review-policy quorum and elder-correction apply/reject routes are covered in `server.test.ts` and store integrity checks. Remaining artifacts: operator-facing audit/export drill walkthrough and acceptance-pack screenshots.
5. **Operator recovery pack (partial — runbook shipped):** [Operator Recovery Runbook](operator-recovery.md) covers local data paths, backup/restore, interrupted-processing recovery, corrupt-database handling, diagnostics, and reset steps. Remaining drill artifacts: timed backup/restore exercise, interrupted-processing drill log, and corrupted-database loud-failure screenshot for the acceptance pack.

## Remaining blockers before real community data

Treat these as implementation tasks before any real community language material is connected:

1. **Community governance gate:** real community/project ownership records, consent and license workflows, AI-use policy capture, revocation handling, and external approval receipts.
2. **Production identity and authorization:** real authentication, membership binding, reviewer assignment tied to membership, enforceable access policies by language/source/purpose/role, and audited offboarding.
3. **Production review accountability:** notification workflows, SLA/queue reporting, external review receipts, export receipts, and tamper-evident long-term audit retention.
4. **Production storage and retention:** choose and implement a production database, write real schema migrations past v8, define retention/deletion rules, run backup/restore drills, and document disaster recovery.
5. **Durable ingestion operations:** chunk-level resumability, retry/max-attempt policy, operator queue controls, full-document OCR for scanned files, and stronger segmentation proposals. Heartbeat/attempt persistence and page-1 scanned-PDF OCR are prototype-only (see Continuous improvement log).
6. **Model governance and regression gates:** persist model-draft scores by provider/model/run, retain named baselines, produce exportable regression reports, track uncertainty and failure reasons consistently, and keep human approval mandatory.
7. **Deployment and security:** decide the deployment target, manage production environment variables/secrets, replace prototype auth, tune production rate limits, expand metrics coverage, keep dependency audit green, run security review, and prepare incident response.
8. **Production-ready authoring and import/export:** richer note/example editing, scalable exercise probe authoring, dry-run TSV/CSV bulk imports, broader validation previews, and review-packet exports that satisfy the governance gate. Single-passage corpus dry-run is prototype-only.
9. **Accessibility and operator UX:** complete keyboard/focus audits, empty/loading/error states, and operator dashboards for ingestion/review/evaluation before handing the system to community reviewers.

## Non-negotiable gate

Do not connect real First Nations, Indigenous, or community language material until governance, consent, access control, review accountability, production auth, storage, security, observability, and export accountability are ready and approved by the relevant community owners.
