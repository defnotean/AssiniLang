# Roadmap

AssiniLang is useful as a local documentation and evaluation workspace today. It is not ready for real community language data. This roadmap names the main gaps before production use.

Recently closed (no longer roadmap items): chunked long-source processing, PDF and DOCX ingestion, async processing with polling, the OCR fallback for images, the SSRF guard on URL sources, and duplicate flags on extraction drafts.

## 1. Real governance layer

Needed before real data:

- Community and project ownership records.
- Production consent and license workflows.
- Enforceable access rules by language, role, source, and purpose.
- External review receipts.
- Tamper-evident production audit retention.
- Clear policies for what AI can and cannot generate.

## 2. Production accounts and review policy

The local prototype can exercise role-aware review behavior, assigned reviewers, approval thresholds, disposition work, and elder corrections. Production still needs:

- Real authentication.
- Project/community membership binding.
- Reviewer assignment workflows tied to membership records.
- Notifications.
- SLA reporting.
- External review and approval receipts.

## 3. Ingestion gaps

The pipeline handles six source kinds with fallbacks, but honest gaps remain:

- OCR for scanned PDFs and DOCX files (the image OCR fallback does not apply to documents yet).
- Resumable background jobs: a crash mid-processing leaves a source stuck `processing` until manually reset.
- Bulk draft review (accept/reject many drafts at once) for large word lists.
- Better segmentation proposals; most extracted passages fall back to token-level "unanalyzed" morphemes.

## 4. Better authoring tools

The web app supports compact corpus import and exercise authoring, but authoring still needs:

- A richer note editor beyond explanation edits.
- Better multi-probe exercise authoring.
- Pre-save validation previews.
- Bulk import tooling.
- Export receipts for production review packets.

## 5. Real study loop

The deterministic study loop is intentional for the current milestone. It proves evaluation without depending on a model.

Next steps:

- Add model-backed draft generation.
- Compare model drafts against immutable answer keys.
- Track uncertainty and failure reasons.
- Prevent hallucinated forms from entering approved notes.
- Evaluate provider regressions across retained baselines.

## 6. Stronger evaluation

The current evaluator is useful but small.

Next steps:

- Broaden evaluation coverage across more user-created languages.
- Add historical trend charts.
- Retain named evaluation baselines.
- Add more adversarial learner/model probes.
- Add exportable regression reports.

## 7. Production storage

The JSON store is good for local development, not production.

Next steps:

- Move to Postgres or another production database.
- Add migrations.
- Add backups and restore testing.
- Consider vector search only after governance and access models are clear.

## 8. Deployment and security

No production deployment exists yet.

Next steps:

- Decide deployment target.
- Add production environment-variable management.
- Replace prototype auth.
- Add API rate limits appropriate for production (the current per-actor limit is a prototype safeguard).
- Add audit log retention controls.
- Run security review before any real data is connected.

## Non-negotiable gate

Do not connect real First Nations, Indigenous, or community language material until governance, consent, access control, review workflows, production auth, storage, security, and export accountability are ready.
