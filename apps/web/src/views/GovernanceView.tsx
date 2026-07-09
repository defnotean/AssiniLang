import type { GovernanceRecord } from "@assini/db";
import type { GovernanceWorkspace } from "../hooks/useGovernanceWorkspace";
import { formatStatus, safeDomId } from "../lib/format";
import { useI18n } from "../i18n";

export function GovernanceView({
  selectedLanguageId,
  governance
}: {
  selectedLanguageId: string;
  governance: GovernanceWorkspace;
}) {
  const {
    governanceState,
    auditEventState,
    policyType,
    policyEffectiveDate,
    policyContent,
    governanceSuccess,
    governanceError,
    isSubmittingGovernance,
    reviewPolicyState,
    reviewPolicyReviewerIds,
    reviewPolicyApprovalThreshold,
    reviewPolicyRequiresAssigned,
    reviewPolicySuccess,
    reviewPolicyError,
    isSubmittingReviewPolicy,
    reviewDispositionState,
    reviewDispositionDrafts,
    reviewDispositionSuccess,
    reviewDispositionError,
    resolvingReviewDispositionId,
    snapshotDownload,
    snapshotError,
    isExportingSnapshot,
    setPolicyType: onPolicyTypeChange,
    setPolicyEffectiveDate: onEffectiveDateChange,
    setPolicyContent: onContentChange,
    handleSubmitGovernance: onSubmit,
    setReviewPolicyReviewerIds: onReviewPolicyReviewerIdsChange,
    setReviewPolicyApprovalThreshold: onReviewPolicyApprovalThresholdChange,
    setReviewPolicyRequiresAssigned: onReviewPolicyRequiresAssignedChange,
    handleSubmitReviewPolicy: onReviewPolicySubmit,
    setReviewDispositionDrafts,
    handleResolveReviewDisposition: onResolveReviewDisposition,
    handleExportSnapshot: onExportSnapshot,
    reloadGovernanceData: onReloadGovernanceData
  } = governance;
  const { t } = useI18n();
  const records = governanceState.status === "ready"
    ? governanceState.data.filter((record) => record.languageId === selectedLanguageId)
    : [];
  const consentRecords = records.filter((record) => record.policyType === "consent");
  const reviewDispositions = reviewDispositionState.status === "ready"
    ? reviewDispositionState.data.filter((disposition) => disposition.languageId === selectedLanguageId)
    : [];
  const auditEvents = auditEventState.status === "ready"
    ? auditEventState.data.filter((event) => event.languageId === selectedLanguageId)
    : [];
  const loadedReviewPolicy = reviewPolicyState.status === "ready" ? reviewPolicyState.data : null;
  const reviewPolicySummary = loadedReviewPolicy ? t("governance.approvalsRequired", { count: loadedReviewPolicy.approvalThreshold }) : null;

  function onReviewDispositionDraftChange(dispositionId: string, summary: string) {
    setReviewDispositionDrafts((drafts) => ({ ...drafts, [dispositionId]: summary }));
  }

  return (
    <div className="governance-view">
      <section className="policy-card">
        <p className="eyebrow">{t("governance.deploymentPolicy")}</p>
        <h2>{t("governance.dataStewardshipPolicy")}</h2>
        <p>
          {t("governance.dataStewardshipIntroBefore")} <strong>{t("governance.localDataStewardshipPolicy")}</strong>{t("governance.dataStewardshipIntroAfter")}
        </p>
      </section>

      <section className="policy-card">
        <form className="form-panel compact" onSubmit={onSubmit}>
          <p className="eyebrow">{t("governance.policyAuthoring")}</p>
          <h2>{t("governance.createPolicyRecord")}</h2>

          {governanceSuccess && <p className="result-notice">{governanceSuccess}</p>}
          {governanceError && <p className="result-notice error">{governanceError}</p>}

          <div className="form-group">
            <label htmlFor="policy-type">{t("governance.policyType")}</label>
            <select
              id="policy-type"
              value={policyType}
              onChange={(event) => onPolicyTypeChange(event.target.value as GovernanceRecord["policyType"])}
            >
              <option value="generation">{t("policyType.generation")}</option>
              <option value="access">{t("policyType.access")}</option>
              <option value="consent">{t("policyType.consent")}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="policy-effective-date">{t("governance.effectiveDate")}</label>
            <input
              id="policy-effective-date"
              type="text"
              inputMode="numeric"
              placeholder={t("governance.effectiveDatePlaceholder")}
              value={policyEffectiveDate}
              onChange={(event) => onEffectiveDateChange(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="policy-content">{t("governance.policyContent")}</label>
            <textarea
              id="policy-content"
              value={policyContent}
              onChange={(event) => onContentChange(event.target.value)}
              placeholder={t("governance.policyContentPlaceholder")}
            />
          </div>

          <button type="submit" disabled={isSubmittingGovernance} aria-busy={isSubmittingGovernance}>
            {isSubmittingGovernance ? t("governance.recording") : t("governance.createPolicyRecord")}
          </button>
        </form>
      </section>

      <section className="policy-card">
        <form className="form-panel compact" onSubmit={onReviewPolicySubmit}>
          <p className="eyebrow">{t("governance.reviewRouting")}</p>
          <h2>{t("governance.reviewPolicy")}</h2>

          {reviewPolicySuccess && <p className="result-notice">{reviewPolicySuccess}</p>}
          {reviewPolicyError && <p className="result-notice error">{reviewPolicyError}</p>}
          {reviewPolicyState.status === "loading" && (
            <p className="inline-empty" role="status" aria-live="polite">
              {t("governance.loadingReviewPolicy")}
            </p>
          )}
          {reviewPolicyState.status === "error" && (
            <div className="inline-empty error" role="alert">
              <p>{reviewPolicyState.message}</p>
              <button type="button" className="secondary" onClick={onReloadGovernanceData}>
                {t("app.retryLoad")}
              </button>
            </div>
          )}
          {reviewPolicySummary && (
            <p className="review-policy-summary">
              <strong>{reviewPolicySummary}</strong>
              <span>
                {loadedReviewPolicy?.requiresAssignedReviewer ? t("governance.assignedReviewersOnly") : t("governance.authorizedReviewers")}
              </span>
            </p>
          )}

          <div className="form-group">
            <label htmlFor="review-policy-reviewers">{t("governance.assignedReviewerIds")}</label>
            <input
              id="review-policy-reviewers"
              type="text"
              value={reviewPolicyReviewerIds}
              onChange={(event) => onReviewPolicyReviewerIdsChange(event.target.value)}
              placeholder={t("governance.assignedReviewerIdsPlaceholder")}
            />
          </div>

          <div className="form-group">
            <label htmlFor="review-policy-threshold">{t("governance.approvalThreshold")}</label>
            <input
              id="review-policy-threshold"
              type="number"
              min="1"
              inputMode="numeric"
              value={reviewPolicyApprovalThreshold}
              onChange={(event) => onReviewPolicyApprovalThresholdChange(event.target.value)}
            />
          </div>

          <label className="checkbox-row" htmlFor="review-policy-requires-assigned">
            <input
              id="review-policy-requires-assigned"
              type="checkbox"
              checked={reviewPolicyRequiresAssigned}
              onChange={(event) => onReviewPolicyRequiresAssignedChange(event.target.checked)}
            />
            <span>{t("governance.requireAssignedReviewer")}</span>
          </label>

          <button type="submit" disabled={isSubmittingReviewPolicy} aria-busy={isSubmittingReviewPolicy}>
            {isSubmittingReviewPolicy ? t("governance.updating") : t("governance.updateReviewPolicy")}
          </button>
        </form>
      </section>

      <section className="policy-card disposition-ledger" aria-label={t("governance.reviewDispositionWork")}>
        <p className="eyebrow">{t("governance.resolutionWorkflow")}</p>
        <h2>{t("governance.reviewDispositionWork")}</h2>

        {reviewDispositionSuccess && <p className="result-notice" role="status">{reviewDispositionSuccess}</p>}
        {reviewDispositionError && <p className="result-notice error">{reviewDispositionError}</p>}

        {reviewDispositionState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            {t("governance.loadingReviewDispositionWork")}
          </p>
        )}

        {reviewDispositionState.status === "error" && (
          <div className="inline-empty error" role="alert">
            <p>{reviewDispositionState.message}</p>
            <button type="button" className="secondary" onClick={onReloadGovernanceData}>
              {t("app.retryLoad")}
            </button>
          </div>
        )}

        {reviewDispositionState.status === "ready" && reviewDispositions.length === 0 && (
          <div className="inline-empty" role="status">
            <p>{t("governance.noReviewDispositionWork")}</p>
            <p className="muted">{t("governance.noReviewDispositionWorkHint")}</p>
          </div>
        )}

        {reviewDispositions.length > 0 && (
          <div className="disposition-list">
            {reviewDispositions.map((disposition) => {
              const resolutionInputId = `resolution-${safeDomId(disposition.id)}`;
              const resolutionDraft = reviewDispositionDrafts[disposition.id] ?? "";
              const isResolving = resolvingReviewDispositionId === disposition.id;
              return (
                <article key={disposition.id} className="disposition-card">
                  <div className="record-topline">
                    <div>
                      <span className="detail-label">{disposition.id}</span>
                      <h3>{t(`reviewDisposition.${disposition.disposition}`)}</h3>
                    </div>
                    <span className={`status-badge ${disposition.status}`}>{formatStatus(disposition.status, t)}</span>
                  </div>
                  <p>{disposition.reason}</p>
                  <div className="pill-row">
                    <span className="pill">{t("governance.notePill", { noteId: disposition.noteId })}</span>
                    <span className="pill">{t("governance.assignedToPill", { assignedTo: disposition.assignedTo })}</span>
                    {disposition.dueAt && <span className="pill">{t("governance.duePill", { dueAt: disposition.dueAt })}</span>}
                    <span className="pill">{t("governance.openedByPill", { openedBy: disposition.openedBy })}</span>
                  </div>

                  {disposition.status === "resolved" ? (
                    <div className="resolution-summary">
                      {disposition.resolvedBy && <strong>{t("governance.resolvedBy", { resolvedBy: disposition.resolvedBy })}</strong>}
                      {disposition.resolutionSummary && <p>{disposition.resolutionSummary}</p>}
                    </div>
                  ) : (
                    <div className="resolution-form">
                      <div className="form-group">
                        <label htmlFor={resolutionInputId}>{t("governance.resolutionSummaryFor", { id: disposition.id })}</label>
                        <textarea
                          id={resolutionInputId}
                          value={resolutionDraft}
                          onChange={(event) => onReviewDispositionDraftChange(disposition.id, event.target.value)}
                          placeholder={t("governance.resolutionSummaryPlaceholder")}
                        />
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={
                          resolvingReviewDispositionId !== null
                          || isResolving
                          || resolutionDraft.trim().length === 0
                        }
                        aria-busy={isResolving}
                        onClick={() => onResolveReviewDisposition(disposition.id)}
                      >
                        {isResolving ? t("governance.resolvingButton", { id: disposition.id }) : t("governance.resolveButton", { id: disposition.id })}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="policy-card audit-ledger" aria-label={t("governance.auditEventLedger")}>
        <p className="eyebrow">{t("governance.mutationTrace")}</p>
        <h2>{t("governance.auditEventLedger")}</h2>

        {auditEventState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            {t("governance.loadingAuditEvents")}
          </p>
        )}

        {auditEventState.status === "error" && (
          <div className="inline-empty error" role="alert">
            <p>{auditEventState.message}</p>
            <button type="button" className="secondary" onClick={onReloadGovernanceData}>
              {t("app.retryLoad")}
            </button>
          </div>
        )}

        {auditEventState.status === "ready" && auditEvents.length === 0 && (
          <div className="inline-empty" role="status">
            <p>{t("governance.noAuditEvents")}</p>
            <p className="muted">{t("governance.noAuditEventsHint")}</p>
          </div>
        )}

        {auditEvents.length > 0 && (
          <div className="audit-event-list">
            {auditEvents.slice().reverse().slice(0, 12).map((event) => (
              <article key={event.id} className="audit-event-card">
                <div className="record-topline">
                  <div>
                    <span className="detail-label">{event.at}</span>
                    <h3>{event.action}</h3>
                  </div>
                  <span className="status-badge under_review">{event.actorRole}</span>
                </div>
                <p>{event.summary}</p>
                <div className="pill-row">
                  <span className="pill">{event.actorId}</span>
                  <span className="pill">{event.entityType} / {event.entityId}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="policy-card snapshot-card">
        <p className="eyebrow">{t("governance.reviewExport")}</p>
        <h2>{t("governance.languageSnapshot")}</h2>
        <p>
          {t("governance.languageSnapshotDescription")}
        </p>
        <div className="snapshot-actions">
          <button
            type="button"
            className="secondary"
            disabled={
              isExportingSnapshot
              || isSubmittingGovernance
              || isSubmittingReviewPolicy
              || resolvingReviewDispositionId !== null
            }
            aria-busy={isExportingSnapshot}
            onClick={onExportSnapshot}
          >
            {isExportingSnapshot ? t("governance.exporting") : t("governance.exportReviewSnapshot")}
          </button>
          {snapshotDownload && (
            <a className="download-link" href={snapshotDownload.href} download={snapshotDownload.fileName}>
              {t("governance.downloadSnapshotJson")}
            </a>
          )}
        </div>
        {snapshotDownload && (
          <div role="status" aria-live="polite">
            <p className="result-notice">{t("governance.exportSuccess")}</p>
            <p className="muted">{snapshotDownload.summary}</p>
          </div>
        )}
        {snapshotError && <p className="result-notice error" role="alert">{snapshotError}</p>}
      </section>

      <div className="table-card">
        <h2>{t("governance.policyRecords")}</h2>

        {governanceState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            {t("governance.loadingGovernanceRecords")}
          </p>
        )}

        {governanceState.status === "error" && (
          <div className="inline-empty error" role="alert">
            <p>{governanceState.message}</p>
            <button type="button" className="secondary" onClick={onReloadGovernanceData}>
              {t("app.retryLoad")}
            </button>
          </div>
        )}

        {governanceState.status === "ready" && records.length === 0 && (
          <div className="inline-empty" role="status">
            <p>{t("governance.noGovernancePolicyRecords")}</p>
            <p className="muted">{t("governance.noConsentPolicyHint")}</p>
          </div>
        )}

        {governanceState.status === "ready" && records.length > 0 && consentRecords.length === 0 && (
          <p className="inline-empty consent-gap" role="status">{t("governance.noConsentPolicyRecords")}</p>
        )}

        {records.length > 0 && (
          <table className="data-table governance-table">
            <thead>
              <tr>
                <th>{t("governance.tableType")}</th>
                <th>{t("governance.tablePolicy")}</th>
                <th>{t("governance.tableEffective")}</th>
                <th>{t("governance.tableApprovedBy")}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{t(`policyType.${record.policyType}`)}</td>
                  <td>{record.content}</td>
                  <td>{record.effectiveDate}</td>
                  <td>{record.approvedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
