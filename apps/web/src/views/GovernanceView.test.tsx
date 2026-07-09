import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GovernanceRecord } from "@assini/db";
import type { GovernanceWorkspace } from "../hooks/useGovernanceWorkspace";
import { GovernanceView } from "./GovernanceView";

function createGovernanceWorkspace(records: GovernanceRecord[] = []): GovernanceWorkspace {
  return {
    governanceState: { status: "ready", data: records },
    policyType: "consent",
    setPolicyType: vi.fn(),
    policyEffectiveDate: "",
    setPolicyEffectiveDate: vi.fn(),
    policyContent: "",
    setPolicyContent: vi.fn(),
    governanceSuccess: null,
    governanceError: null,
    isSubmittingGovernance: false,
    auditEventState: { status: "ready", data: [] },
    reviewPolicyState: { status: "ready", data: { id: "policy-avenik", languageId: "avenik", assignedReviewerIds: [], approvalThreshold: 1, requiresAssignedReviewer: false, updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: "system" } },
    reviewPolicyReviewerIds: "",
    setReviewPolicyReviewerIds: vi.fn(),
    reviewPolicyApprovalThreshold: "1",
    setReviewPolicyApprovalThreshold: vi.fn(),
    reviewPolicyRequiresAssigned: false,
    setReviewPolicyRequiresAssigned: vi.fn(),
    reviewPolicySuccess: null,
    reviewPolicyError: null,
    isSubmittingReviewPolicy: false,
    reviewDispositionState: { status: "ready", data: [] },
    reviewDispositionDrafts: {},
    setReviewDispositionDrafts: vi.fn(),
    reviewDispositionSuccess: null,
    reviewDispositionError: null,
    resolvingReviewDispositionId: null,
    snapshotDownload: null,
    snapshotError: null,
    isExportingSnapshot: false,
    evaluationArtifactDownload: null,
    evaluationArtifactError: null,
    isExportingEvaluationArtifact: false,
    handleSubmitGovernance: vi.fn(),
    handleSubmitReviewPolicy: vi.fn(),
    handleResolveReviewDisposition: vi.fn(),
    handleExportSnapshot: vi.fn(),
    handleExportEvaluationArtifact: vi.fn(),
    reloadGovernanceData: vi.fn()
  };
}

describe("GovernanceView consent empty states", () => {
  it("guides operators to record a consent policy when no governance records exist", () => {
    render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={createGovernanceWorkspace()}
      />
    );

    expect(screen.getByText("No governance policy records for this language yet.")).toBeInTheDocument();
    expect(screen.getByText("Record a consent policy above before promoting corpus material. Link consent records in Build when importing passages.")).toBeInTheDocument();
  });

  it("flags a missing consent policy when other policy types already exist", () => {
    render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={createGovernanceWorkspace([
          {
            id: "governance-1",
            languageId: "avenik",
            policyType: "access",
            content: "Only reviewers may approve community notes.",
            effectiveDate: "2026-06-05",
            approvedBy: "lead-1"
          }
        ])}
      />
    );

    expect(screen.getByText("Only reviewers may approve community notes.")).toBeInTheDocument();
    expect(screen.getByText("No consent policy recorded yet. Add one above to document how corpus material may be used.")).toBeInTheDocument();
    expect(screen.queryByText("No governance policy records for this language yet.")).not.toBeInTheDocument();
  });
});
