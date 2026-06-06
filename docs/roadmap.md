# Roadmap

AssiniLang is useful as a synthetic testbed today. It is not ready for real community language data. This roadmap names the main gaps before production use.

## 1. Real Governance Layer

Needed before real data:

- Community and project ownership records.
- Production consent and license workflows.
- Enforceable access rules by language, role, source, and purpose.
- External review receipts.
- Tamper-evident production audit retention.
- Clear policies for what AI can and cannot generate.

## 2. Production Accounts And Review Policy

The local prototype can exercise role-aware review behavior, assigned reviewers, approval thresholds, disposition work, and elder corrections. Production still needs:

- Real authentication.
- Project/community membership binding.
- Reviewer assignment workflows tied to membership records.
- Notifications.
- SLA reporting.
- External review and approval receipts.

## 3. Better Authoring Tools

The web app now supports compact corpus import and exercise authoring, but authoring still needs:

- A richer note editor beyond explanation edits.
- Better multi-probe exercise authoring.
- Pre-save validation previews.
- Bulk import tooling.
- Export receipts for production review packets.

## 4. Real Study Loop

The deterministic study loop is intentional for the synthetic milestone. It proves evaluation without depending on a model.

Next steps:

- Add model-backed draft generation.
- Compare model drafts against immutable answer keys.
- Track uncertainty and failure reasons.
- Prevent hallucinated forms from entering approved notes.
- Evaluate provider regressions across retained baselines.

## 5. Stronger Evaluation

The current evaluator is useful but small.

Next steps:

- Add more synthetic languages.
- Deepen dialect histories.
- Add historical trend charts.
- Retain named evaluation baselines.
- Add more adversarial learner/model probes.
- Add exportable regression reports.

## 6. Production Storage

The JSON store is good for local development, not production.

Next steps:

- Move to Postgres or another production database.
- Add migrations.
- Add stable IDs and timestamps.
- Add backups.
- Add restore testing.
- Consider vector search only after governance and access models are clear.

## 7. Deployment And Security

No production deployment exists yet.

Next steps:

- Decide deployment target.
- Add production environment-variable management.
- Replace prototype auth.
- Add API rate limits appropriate for production.
- Add audit log retention controls.
- Run security review before any real data is connected.

## Non-Negotiable Gate

Do not connect real First Nations, Indigenous, or community language material until governance, consent, access control, review workflows, production auth, storage, security, and export accountability are ready.
