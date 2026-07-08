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

## Partial or prototype-only capabilities

These features are useful locally but are not production-ready:

- **Governance and consent:** the app can record local governance/provenance data, but it does not provide legally or community-enforceable consent, licensing, data-sharing, or AI-use workflows.
- **Accounts and membership:** prototype sessions, local users, and role checks exercise review behavior, but there is no production authentication, identity proofing, community/project membership binding, or invitation/offboarding flow.
- **Access control:** routes and public projections redact sensitive fields, but there is no production policy engine for language-, role-, source-, purpose-, or community-specific access decisions.
- **Background jobs:** interrupted jobs are no longer stuck forever, but jobs are not durable/resumable at chunk level, do not persist heartbeat/attempt counts, and do not have max-attempt retry policy beyond marking interrupted work failed for manual re-run.
- **Document OCR:** images have OCR fallback, and PDFs/DOCX files are parsed when text is embedded, but scanned PDFs/DOCX pages still need document OCR.
- **Morphology/segmentation quality:** extracted passages still often fall back to token-level `unanalyzed` morphemes; better segmentation proposals and validation tooling are still needed.
- **Model-draft evaluation:** grounding scores and model-draft evaluation paths exist, but per-draft scoring is not retained as a durable provider/model artifact, there is no uncertainty taxonomy beyond failure strings, and there are no named provider regression baselines.
- **Evaluation scale:** the deterministic harness is useful but small; it needs broader fixtures, retained baselines, regression exports, and adversarial probes across more user-created languages.
- **Authoring UX:** compact corpus import, exercise authoring, model exercise drafts, and note explanation edits exist. Rich structured note/example editing, N-probe exercise authoring, dry-run TSV/CSV imports, and pre-save validation previews remain incomplete.
- **Operations:** SQLite migrations and backup/restore are implemented for the local store, but there is no production database target, retention policy, disaster-recovery drill, or operational runbook for real data.
- **Observability/security:** AI-session observability, audit events, request-id correlation, and a green dependency-audit gate exist, but production metrics, secrets management, rate-limit policy, security review, and incident response are not complete.

## Next milestone: reviewer-ready local beta

Before treating AssiniLang as a stable local beta for non-sensitive synthetic or user-created data, ship these checkable artifacts:

1. **Workflow acceptance pack:** desktop smoke screenshots for Start, Build, Practice, and Settings at desktop/tablet/mobile widths, including empty states, long model names, and graph mode.
2. **Model operations pack:** `npm.cmd run model:verify` report for at least one local model, one saved-profile switch test, one unloaded-model stale-state test, and documented timeout/max-token recommendations for slow local models.
3. **Corpus intake pack:** Obsidian vault import fixture, bulk source processing fixture, graph rendering fixture, and failure examples for bad vault paths, unreadable notes, and oversized imports.
4. **Review accountability pack:** audit/export sample, review-policy quorum test, elder-correction apply/reject test, and a redaction check showing no answer keys, prompts, or API keys in public/exported shapes.
5. **Operator recovery pack:** backup/restore drill, interrupted-processing recovery drill, corrupted-database loud-failure example, and a short runbook for local data location, logs, diagnostics, and reset steps.

## Remaining blockers before real community data

Treat these as implementation tasks before any real community language material is connected:

1. **Community governance gate:** real community/project ownership records, consent and license workflows, AI-use policy capture, revocation handling, and external approval receipts.
2. **Production identity and authorization:** real authentication, membership binding, reviewer assignment tied to membership, enforceable access policies by language/source/purpose/role, and audited offboarding.
3. **Production review accountability:** notification workflows, SLA/queue reporting, external review receipts, export receipts, and tamper-evident long-term audit retention.
4. **Production storage and retention:** choose and implement a production database, write real schema migrations past v8, define retention/deletion rules, run backup/restore drills, and document disaster recovery.
5. **Durable ingestion operations:** chunk-level resumability, persisted job heartbeats/attempts, retry/max-attempt policy, operator queue controls, document OCR for scanned files, and stronger segmentation proposals.
6. **Model governance and regression gates:** persist model-draft scores by provider/model/run, retain named baselines, produce exportable regression reports, track uncertainty and failure reasons consistently, and keep human approval mandatory.
7. **Deployment and security:** decide the deployment target, manage production environment variables/secrets, replace prototype auth, tune production rate limits, expand metrics coverage, keep dependency audit green, run security review, and prepare incident response.
8. **Production-ready authoring and import/export:** richer note/example editing, scalable exercise probe authoring, dry-run bulk imports, validation previews, and review-packet exports that satisfy the governance gate.
9. **Accessibility and operator UX:** complete keyboard/focus audits, empty/loading/error states, and operator dashboards for ingestion/review/evaluation before handing the system to community reviewers.

## Non-negotiable gate

Do not connect real First Nations, Indigenous, or community language material until governance, consent, access control, review accountability, production auth, storage, security, observability, and export accountability are ready and approved by the relevant community owners.
