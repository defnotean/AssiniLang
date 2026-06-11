import type { FormEvent } from "react";
import type { AuditEvent, GovernanceRecord, ReviewDisposition, ReviewPolicy } from "@assini/db";
import { formatStatus, safeDomId } from "../lib/format";
import { POLICY_TYPE_LABELS, REVIEW_DISPOSITION_LABELS } from "../lib/viewConfig";
import type { AsyncState, SnapshotDownload } from "../lib/types";

export function GovernanceView({
  selectedLanguageId,
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
  onPolicyTypeChange,
  onEffectiveDateChange,
  onContentChange,
  onSubmit,
  onReviewPolicyReviewerIdsChange,
  onReviewPolicyApprovalThresholdChange,
  onReviewPolicyRequiresAssignedChange,
  onReviewPolicySubmit,
  onReviewDispositionDraftChange,
  onResolveReviewDisposition,
  onExportSnapshot
}: {
  selectedLanguageId: string;
  governanceState: AsyncState<GovernanceRecord[]>;
  auditEventState: AsyncState<AuditEvent[]>;
  policyType: GovernanceRecord["policyType"];
  policyEffectiveDate: string;
  policyContent: string;
  governanceSuccess: string | null;
  governanceError: string | null;
  isSubmittingGovernance: boolean;
  reviewPolicyState: AsyncState<ReviewPolicy>;
  reviewPolicyReviewerIds: string;
  reviewPolicyApprovalThreshold: string;
  reviewPolicyRequiresAssigned: boolean;
  reviewPolicySuccess: string | null;
  reviewPolicyError: string | null;
  isSubmittingReviewPolicy: boolean;
  reviewDispositionState: AsyncState<ReviewDisposition[]>;
  reviewDispositionDrafts: Record<string, string>;
  reviewDispositionSuccess: string | null;
  reviewDispositionError: string | null;
  resolvingReviewDispositionId: string | null;
  snapshotDownload: SnapshotDownload | null;
  snapshotError: string | null;
  isExportingSnapshot: boolean;
  onPolicyTypeChange: (value: GovernanceRecord["policyType"]) => void;
  onEffectiveDateChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onReviewPolicyReviewerIdsChange: (value: string) => void;
  onReviewPolicyApprovalThresholdChange: (value: string) => void;
  onReviewPolicyRequiresAssignedChange: (value: boolean) => void;
  onReviewPolicySubmit: (event: FormEvent) => void;
  onReviewDispositionDraftChange: (dispositionId: string, summary: string) => void;
  onResolveReviewDisposition: (dispositionId: string) => void;
  onExportSnapshot: () => void;
}) {
  const records = governanceState.status === "ready"
    ? governanceState.data.filter((record) => record.languageId === selectedLanguageId)
    : [];
  const reviewDispositions = reviewDispositionState.status === "ready"
    ? reviewDispositionState.data.filter((disposition) => disposition.languageId === selectedLanguageId)
    : [];
  const auditEvents = auditEventState.status === "ready"
    ? auditEventState.data.filter((event) => event.languageId === selectedLanguageId)
    : [];
  const loadedReviewPolicy = reviewPolicyState.status === "ready" ? reviewPolicyState.data : null;
  const reviewPolicySummary = loadedReviewPolicy ? `${loadedReviewPolicy.approvalThreshold} approvals required` : null;

  return (
    <div className="governance-view">
      <section className="policy-card">
        <p className="eyebrow">Deployment policy</p>
        <h2>Data Stewardship Policy</h2>
        <p>
          This platform operates under a <strong>Local Data Stewardship Policy</strong>. Every source is ingested with
          provenance and consent records, processing happens on this machine, and all model outputs must remain
          reviewable by authorized local users before teaching content is promoted.
        </p>
      </section>

      <section className="policy-card">
        <form className="form-panel compact" onSubmit={onSubmit}>
          <p className="eyebrow">Policy authoring</p>
          <h2>Create policy record</h2>

          {governanceSuccess && <p className="result-notice">{governanceSuccess}</p>}
          {governanceError && <p className="result-notice error">{governanceError}</p>}

          <div className="form-group">
            <label htmlFor="policy-type">Policy type</label>
            <select
              id="policy-type"
              value={policyType}
              onChange={(event) => onPolicyTypeChange(event.target.value as GovernanceRecord["policyType"])}
            >
              <option value="generation">Generation</option>
              <option value="access">Access</option>
              <option value="consent">Consent</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="policy-effective-date">Effective date</label>
            <input
              id="policy-effective-date"
              type="text"
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              value={policyEffectiveDate}
              onChange={(event) => onEffectiveDateChange(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="policy-content">Policy content</label>
            <textarea
              id="policy-content"
              value={policyContent}
              onChange={(event) => onContentChange(event.target.value)}
              placeholder="Write a consent, access, or generation rule"
            />
          </div>

          <button type="submit" disabled={isSubmittingGovernance}>
            {isSubmittingGovernance ? "Recording..." : "Create policy record"}
          </button>
        </form>
      </section>

      <section className="policy-card">
        <form className="form-panel compact" onSubmit={onReviewPolicySubmit}>
          <p className="eyebrow">Review routing</p>
          <h2>Review policy</h2>

          {reviewPolicySuccess && <p className="result-notice">{reviewPolicySuccess}</p>}
          {reviewPolicyError && <p className="result-notice error">{reviewPolicyError}</p>}
          {reviewPolicyState.status === "loading" && (
            <p className="inline-empty" role="status" aria-live="polite">
              Loading review policy.
            </p>
          )}
          {reviewPolicyState.status === "error" && (
            <p className="inline-empty error" role="alert">
              {reviewPolicyState.message}
            </p>
          )}
          {reviewPolicySummary && (
            <p className="review-policy-summary">
              <strong>{reviewPolicySummary}</strong>
              <span>
                {loadedReviewPolicy?.requiresAssignedReviewer ? "assigned reviewers only" : "authorized reviewers"}
              </span>
            </p>
          )}

          <div className="form-group">
            <label htmlFor="review-policy-reviewers">Assigned reviewer IDs</label>
            <input
              id="review-policy-reviewers"
              type="text"
              value={reviewPolicyReviewerIds}
              onChange={(event) => onReviewPolicyReviewerIdsChange(event.target.value)}
              placeholder="reviewer-1, elder-1"
            />
          </div>

          <div className="form-group">
            <label htmlFor="review-policy-threshold">Approval threshold</label>
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
            <span>Require assigned reviewer</span>
          </label>

          <button type="submit" disabled={isSubmittingReviewPolicy}>
            {isSubmittingReviewPolicy ? "Updating..." : "Update review policy"}
          </button>
        </form>
      </section>

      <section className="policy-card disposition-ledger" aria-label="Review disposition work">
        <p className="eyebrow">Resolution workflow</p>
        <h2>Review disposition work</h2>

        {reviewDispositionSuccess && <p className="result-notice" role="status">{reviewDispositionSuccess}</p>}
        {reviewDispositionError && <p className="result-notice error">{reviewDispositionError}</p>}

        {reviewDispositionState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            Loading review disposition work.
          </p>
        )}

        {reviewDispositionState.status === "error" && (
          <p className="inline-empty error" role="alert">
            {reviewDispositionState.message}
          </p>
        )}

        {reviewDispositionState.status === "ready" && reviewDispositions.length === 0 && (
          <p className="inline-empty">No review disposition work for this language.</p>
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
                      <h3>{REVIEW_DISPOSITION_LABELS[disposition.disposition]}</h3>
                    </div>
                    <span className={`status-badge ${disposition.status}`}>{formatStatus(disposition.status)}</span>
                  </div>
                  <p>{disposition.reason}</p>
                  <div className="pill-row">
                    <span className="pill">Note: {disposition.noteId}</span>
                    <span className="pill">Assigned to {disposition.assignedTo}</span>
                    {disposition.dueAt && <span className="pill">Due {disposition.dueAt}</span>}
                    <span className="pill">Opened by {disposition.openedBy}</span>
                  </div>

                  {disposition.status === "resolved" ? (
                    <div className="resolution-summary">
                      {disposition.resolvedBy && <strong>Resolved by {disposition.resolvedBy}</strong>}
                      {disposition.resolutionSummary && <p>{disposition.resolutionSummary}</p>}
                    </div>
                  ) : (
                    <div className="resolution-form">
                      <div className="form-group">
                        <label htmlFor={resolutionInputId}>Resolution summary for {disposition.id}</label>
                        <textarea
                          id={resolutionInputId}
                          value={resolutionDraft}
                          onChange={(event) => onReviewDispositionDraftChange(disposition.id, event.target.value)}
                          placeholder="Record the review decision, correction, or follow-up evidence."
                        />
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={isResolving || resolutionDraft.trim().length === 0}
                        onClick={() => onResolveReviewDisposition(disposition.id)}
                      >
                        {isResolving ? `Resolving ${disposition.id}...` : `Resolve ${disposition.id}`}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="policy-card audit-ledger" aria-label="Audit event ledger">
        <p className="eyebrow">Mutation trace</p>
        <h2>Audit event ledger</h2>

        {auditEventState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            Loading audit events.
          </p>
        )}

        {auditEventState.status === "error" && (
          <p className="inline-empty error" role="alert">
            {auditEventState.message}
          </p>
        )}

        {auditEventState.status === "ready" && auditEvents.length === 0 && (
          <p className="inline-empty">No audit events for this language yet.</p>
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
        <p className="eyebrow">Review export</p>
        <h2>Language snapshot</h2>
        <p>
          Build a sanitized JSON packet for this language with corpus, public notes, public exercises, governance records,
          and evaluation summaries. Answer keys and learner submissions stay out of the export.
        </p>
        <div className="snapshot-actions">
          <button type="button" className="secondary" disabled={isExportingSnapshot} onClick={onExportSnapshot}>
            {isExportingSnapshot ? "Exporting..." : "Export review snapshot"}
          </button>
          {snapshotDownload && (
            <a className="download-link" href={snapshotDownload.href} download={snapshotDownload.fileName}>
              Download snapshot JSON
            </a>
          )}
        </div>
        {snapshotDownload && (
          <p className="result-notice" role="status">
            {snapshotDownload.summary}
          </p>
        )}
        {snapshotError && <p className="result-notice error">{snapshotError}</p>}
      </section>

      <div className="table-card">
        <h2>Policy Records</h2>

        {governanceState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            Loading governance records.
          </p>
        )}

        {governanceState.status === "error" && (
          <p className="inline-empty error" role="alert">
            {governanceState.message}
          </p>
        )}

        {governanceState.status === "ready" && records.length === 0 && (
          <p className="inline-empty">No governance policy records for this language yet.</p>
        )}

        {records.length > 0 && (
          <table className="data-table governance-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Policy</th>
                <th>Effective</th>
                <th>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{POLICY_TYPE_LABELS[record.policyType]}</td>
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
