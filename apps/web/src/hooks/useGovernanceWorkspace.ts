import { useCallback, useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { AuditEvent, GovernanceRecord, ReviewDisposition, ReviewPolicy } from "@assini/db";
import type { GovernancePayload, ReviewPolicyPayload } from "../api";
import {
  createGovernanceRecord,
  fetchAuditEvents,
  fetchEvaluationArtifact,
  fetchGovernance,
  fetchLanguageSnapshot,
  fetchReviewDispositions,
  fetchReviewPolicy,
  resolveReviewDisposition,
  updateReviewPolicy
} from "../api";
import { buildEvaluationArtifactDownload, buildSnapshotDownload, parseReviewerIds } from "../lib/format";
import type { AsyncState, SnapshotDownload, ViewMode } from "../lib/types";
import { useI18n } from "../i18n";

export interface GovernanceWorkspace {
  governanceState: AsyncState<GovernanceRecord[]>;
  policyType: GovernanceRecord["policyType"];
  setPolicyType: Dispatch<SetStateAction<GovernanceRecord["policyType"]>>;
  policyEffectiveDate: string;
  setPolicyEffectiveDate: Dispatch<SetStateAction<string>>;
  policyContent: string;
  setPolicyContent: Dispatch<SetStateAction<string>>;
  governanceSuccess: string | null;
  governanceError: string | null;
  isSubmittingGovernance: boolean;
  auditEventState: AsyncState<AuditEvent[]>;
  reviewPolicyState: AsyncState<ReviewPolicy>;
  reviewPolicyReviewerIds: string;
  setReviewPolicyReviewerIds: Dispatch<SetStateAction<string>>;
  reviewPolicyApprovalThreshold: string;
  setReviewPolicyApprovalThreshold: Dispatch<SetStateAction<string>>;
  reviewPolicyRequiresAssigned: boolean;
  setReviewPolicyRequiresAssigned: Dispatch<SetStateAction<boolean>>;
  reviewPolicySuccess: string | null;
  reviewPolicyError: string | null;
  isSubmittingReviewPolicy: boolean;
  reviewDispositionState: AsyncState<ReviewDisposition[]>;
  reviewDispositionDrafts: Record<string, string>;
  setReviewDispositionDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  reviewDispositionSuccess: string | null;
  reviewDispositionError: string | null;
  resolvingReviewDispositionId: string | null;
  snapshotDownload: SnapshotDownload | null;
  snapshotError: string | null;
  isExportingSnapshot: boolean;
  evaluationArtifactDownload: SnapshotDownload | null;
  evaluationArtifactError: string | null;
  isExportingEvaluationArtifact: boolean;
  handleSubmitGovernance: (event: FormEvent) => Promise<void>;
  handleSubmitReviewPolicy: (event: FormEvent) => Promise<void>;
  handleResolveReviewDisposition: (dispositionId: string) => Promise<void>;
  handleExportSnapshot: () => Promise<void>;
  handleExportEvaluationArtifact: () => Promise<void>;
  reloadGovernanceData: () => void;
}

/**
 * Owns the governance workspace state: governance records, audit events,
 * review policy form, review dispositions, and snapshot/evaluation-artifact
 * exports, plus their loading effects and per-language reset effect.
 */
export function useGovernanceWorkspace(
  selectedLanguageId: string | null,
  view: ViewMode,
  refreshDashboard: () => Promise<void>
): GovernanceWorkspace {
  const { t } = useI18n();
  const [governanceState, setGovernanceState] = useState<AsyncState<GovernanceRecord[]>>({ status: "idle" });
  const [policyType, setPolicyType] = useState<GovernanceRecord["policyType"]>("generation");
  const [policyEffectiveDate, setPolicyEffectiveDate] = useState("");
  const [policyContent, setPolicyContent] = useState("");
  const [governanceSuccess, setGovernanceSuccess] = useState<string | null>(null);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [isSubmittingGovernance, setIsSubmittingGovernance] = useState(false);
  const [auditEventState, setAuditEventState] = useState<AsyncState<AuditEvent[]>>({ status: "idle" });
  const [reviewPolicyState, setReviewPolicyState] = useState<AsyncState<ReviewPolicy>>({ status: "idle" });
  const [reviewPolicyReviewerIds, setReviewPolicyReviewerIds] = useState("");
  const [reviewPolicyApprovalThreshold, setReviewPolicyApprovalThreshold] = useState("1");
  const [reviewPolicyRequiresAssigned, setReviewPolicyRequiresAssigned] = useState(true);
  const [reviewPolicySuccess, setReviewPolicySuccess] = useState<string | null>(null);
  const [reviewPolicyError, setReviewPolicyError] = useState<string | null>(null);
  const [isSubmittingReviewPolicy, setIsSubmittingReviewPolicy] = useState(false);
  const [reviewDispositionState, setReviewDispositionState] = useState<AsyncState<ReviewDisposition[]>>({ status: "idle" });
  const [reviewDispositionDrafts, setReviewDispositionDrafts] = useState<Record<string, string>>({});
  const [reviewDispositionSuccess, setReviewDispositionSuccess] = useState<string | null>(null);
  const [reviewDispositionError, setReviewDispositionError] = useState<string | null>(null);
  const [resolvingReviewDispositionId, setResolvingReviewDispositionId] = useState<string | null>(null);
  const [snapshotDownload, setSnapshotDownload] = useState<SnapshotDownload | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);
  const [evaluationArtifactDownload, setEvaluationArtifactDownload] = useState<SnapshotDownload | null>(null);
  const [evaluationArtifactError, setEvaluationArtifactError] = useState<string | null>(null);
  const [isExportingEvaluationArtifact, setIsExportingEvaluationArtifact] = useState(false);

  const reloadGovernanceData = useCallback(() => {
    if (!selectedLanguageId) return;

    setGovernanceState({ status: "loading" });
    setAuditEventState({ status: "loading" });
    setReviewPolicyState({ status: "loading" });
    setReviewDispositionState({ status: "loading" });
    fetchGovernance()
      .then((records) => {
        setGovernanceState({ status: "ready", data: records });
      })
      .catch((error: Error) => {
        setGovernanceState({ status: "error", message: error.message });
      });
    const reviewPolicyRequest = fetchReviewPolicy(selectedLanguageId)
      .then((policy) => {
        setReviewPolicyState({ status: "ready", data: policy });
        setReviewPolicyReviewerIds(policy.assignedReviewerIds.join(", "));
        setReviewPolicyApprovalThreshold(policy.approvalThreshold.toString());
        setReviewPolicyRequiresAssigned(policy.requiresAssignedReviewer);
      })
      .catch((error: Error) => {
        setReviewPolicyState({ status: "error", message: error.message });
      });
    const reviewDispositionRequest = fetchReviewDispositions(selectedLanguageId)
      .then((dispositions) => {
        setReviewDispositionState({ status: "ready", data: dispositions });
      })
      .catch((error: Error) => {
        setReviewDispositionState({ status: "error", message: error.message });
      });
    void Promise.allSettled([reviewPolicyRequest, reviewDispositionRequest])
      .then(() => fetchAuditEvents(selectedLanguageId)
        .then((events) => {
          setAuditEventState({ status: "ready", data: events });
        })
        .catch((error: Error) => {
          setAuditEventState({ status: "error", message: error.message });
        }));
  }, [selectedLanguageId]);

  useEffect(() => {
    if ((view !== "governance" && view !== "model") || !selectedLanguageId) {
      return undefined;
    }

    setGovernanceSuccess(null);
    setGovernanceError(null);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    reloadGovernanceData();
  }, [view, selectedLanguageId, reloadGovernanceData]);

  useEffect(() => {
    setPolicyType("generation");
    setPolicyEffectiveDate("");
    setPolicyContent("");
    setGovernanceSuccess(null);
    setGovernanceError(null);
    setAuditEventState({ status: "idle" });
    setReviewPolicyState({ status: "idle" });
    setReviewPolicyReviewerIds("");
    setReviewPolicyApprovalThreshold("1");
    setReviewPolicyRequiresAssigned(true);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);
    setReviewDispositionState({ status: "idle" });
    setReviewDispositionDrafts({});
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    setSnapshotDownload(null);
    setSnapshotError(null);
    setEvaluationArtifactDownload(null);
    setEvaluationArtifactError(null);
  }, [selectedLanguageId]);

  async function handleSubmitGovernance(event: FormEvent) {
    event.preventDefault();
    const content = policyContent.trim();
    const effectiveDate = policyEffectiveDate.trim();

    if (!content || !effectiveDate) {
      setGovernanceSuccess(null);
      setGovernanceError(t("governance.errPolicyContentRequired"));
      return;
    }

    if (!selectedLanguageId) {
      setGovernanceSuccess(null);
      setGovernanceError(t("errors.selectOrCreateLanguage"));
      return;
    }

    setIsSubmittingGovernance(true);
    setGovernanceSuccess(null);
    setGovernanceError(null);

    const payload: GovernancePayload = {
      languageId: selectedLanguageId,
      policyType,
      content,
      effectiveDate
    };

    try {
      await createGovernanceRecord(payload);
      setPolicyContent("");
      setGovernanceSuccess(t("governance.msgPolicyRecorded"));
      setGovernanceState({ status: "ready", data: await fetchGovernance() });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("governance.errPolicyCreationFailed");
      setGovernanceError(message);
    } finally {
      setIsSubmittingGovernance(false);
    }
  }

  async function handleSubmitReviewPolicy(event: FormEvent) {
    event.preventDefault();
    const assignedReviewerIds = parseReviewerIds(reviewPolicyReviewerIds);
    const approvalThreshold = Number.parseInt(reviewPolicyApprovalThreshold, 10);

    if (assignedReviewerIds.length === 0) {
      setReviewPolicySuccess(null);
      setReviewPolicyError(t("governance.errReviewerIdRequired"));
      return;
    }

    if (!Number.isInteger(approvalThreshold) || approvalThreshold < 1) {
      setReviewPolicySuccess(null);
      setReviewPolicyError(t("governance.errApprovalThresholdInvalid"));
      return;
    }

    if (reviewPolicyRequiresAssigned && approvalThreshold > assignedReviewerIds.length) {
      setReviewPolicySuccess(null);
      setReviewPolicyError(t("governance.errApprovalThresholdExceedsReviewers"));
      return;
    }

    if (!selectedLanguageId) {
      setReviewPolicySuccess(null);
      setReviewPolicyError(t("errors.selectOrCreateLanguage"));
      return;
    }

    const payload: ReviewPolicyPayload = {
      assignedReviewerIds,
      approvalThreshold,
      requiresAssignedReviewer: reviewPolicyRequiresAssigned
    };

    setIsSubmittingReviewPolicy(true);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);

    try {
      const policy = await updateReviewPolicy(selectedLanguageId, payload);
      setReviewPolicyState({ status: "ready", data: policy });
      setReviewPolicyReviewerIds(policy.assignedReviewerIds.join(", "));
      setReviewPolicyApprovalThreshold(policy.approvalThreshold.toString());
      setReviewPolicyRequiresAssigned(policy.requiresAssignedReviewer);
      setReviewPolicySuccess(t("governance.msgReviewPolicyUpdated"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("governance.errReviewPolicyUpdateFailed");
      setReviewPolicyError(message);
    } finally {
      setIsSubmittingReviewPolicy(false);
    }
  }

  async function handleResolveReviewDisposition(dispositionId: string) {
    const resolutionSummary = (reviewDispositionDrafts[dispositionId] ?? "").trim();
    if (resolutionSummary.length === 0) {
      setReviewDispositionSuccess(null);
      setReviewDispositionError(t("governance.errResolutionSummaryRequired"));
      return;
    }

    if (!selectedLanguageId) {
      setReviewDispositionSuccess(null);
      setReviewDispositionError(t("errors.selectOrCreateLanguage"));
      return;
    }

    setResolvingReviewDispositionId(dispositionId);
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    try {
      await resolveReviewDisposition(dispositionId, resolutionSummary);
      const [dispositions] = await Promise.all([
        fetchReviewDispositions(selectedLanguageId),
        refreshDashboard()
      ]);
      setReviewDispositionState({ status: "ready", data: dispositions });
      setReviewDispositionDrafts((drafts) => ({ ...drafts, [dispositionId]: "" }));
      setReviewDispositionSuccess(t("governance.msgReviewDispositionResolved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("governance.errReviewDispositionResolutionFailed");
      setReviewDispositionError(message);
    } finally {
      setResolvingReviewDispositionId(null);
    }
  }

  async function handleExportSnapshot() {
    if (!selectedLanguageId) {
      setSnapshotDownload(null);
      setSnapshotError(t("errors.selectOrCreateLanguage"));
      return;
    }

    setIsExportingSnapshot(true);
    setSnapshotDownload(null);
    setSnapshotError(null);

    try {
      const snapshot = await fetchLanguageSnapshot(selectedLanguageId);
      setSnapshotDownload(buildSnapshotDownload(snapshot));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("governance.errSnapshotExportFailed");
      setSnapshotError(message);
    } finally {
      setIsExportingSnapshot(false);
    }
  }

  async function handleExportEvaluationArtifact() {
    setIsExportingEvaluationArtifact(true);
    setEvaluationArtifactDownload(null);
    setEvaluationArtifactError(null);

    try {
      const artifact = await fetchEvaluationArtifact();
      setEvaluationArtifactDownload(buildEvaluationArtifactDownload(artifact));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("governance.errEvaluationArtifactExportFailed");
      setEvaluationArtifactError(message);
    } finally {
      setIsExportingEvaluationArtifact(false);
    }
  }

  return {
    governanceState,
    policyType,
    setPolicyType,
    policyEffectiveDate,
    setPolicyEffectiveDate,
    policyContent,
    setPolicyContent,
    governanceSuccess,
    governanceError,
    isSubmittingGovernance,
    auditEventState,
    reviewPolicyState,
    reviewPolicyReviewerIds,
    setReviewPolicyReviewerIds,
    reviewPolicyApprovalThreshold,
    setReviewPolicyApprovalThreshold,
    reviewPolicyRequiresAssigned,
    setReviewPolicyRequiresAssigned,
    reviewPolicySuccess,
    reviewPolicyError,
    isSubmittingReviewPolicy,
    reviewDispositionState,
    reviewDispositionDrafts,
    setReviewDispositionDrafts,
    reviewDispositionSuccess,
    reviewDispositionError,
    resolvingReviewDispositionId,
    snapshotDownload,
    snapshotError,
    isExportingSnapshot,
    evaluationArtifactDownload,
    evaluationArtifactError,
    isExportingEvaluationArtifact,
    handleSubmitGovernance,
    handleSubmitReviewPolicy,
    handleResolveReviewDisposition,
    handleExportSnapshot,
    handleExportEvaluationArtifact,
    reloadGovernanceData
  };
}
