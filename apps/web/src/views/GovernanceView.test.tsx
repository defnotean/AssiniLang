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
    expect(
      screen.getByText(
        "Add a consent, access, or generation policy above to document how this language's material may be used and reviewed."
      )
    ).toBeInTheDocument();
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

  it("shows next-step hints for empty disposition and audit ledgers", () => {
    render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={createGovernanceWorkspace()}
      />
    );

    expect(screen.getByText("No review disposition work for this language.")).toBeInTheDocument();
    expect(screen.getByText(/Disposition work appears when reviewers contest/i)).toBeInTheDocument();
    expect(screen.getByText("No audit events for this language yet.")).toBeInTheDocument();
    expect(screen.getByText(/Audit events appear after policy changes/i)).toBeInTheDocument();
  });
});

describe("GovernanceView export and disposition guards", () => {
  it("announces snapshot export success with aria-live status messaging", () => {
    const workspace = createGovernanceWorkspace();
    workspace.snapshotDownload = {
      fileName: "assini-avenik-snapshot.json",
      href: "data:application/json;charset=utf-8,%7B%7D",
      summary: "Snapshot ready: 0 corpus passages, 0 notes.",
      exportedAt: "2026-07-01T00:00:00.000Z"
    };

    render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={workspace}
      />
    );

    const exportStatus = screen.getByText("Language snapshot exported.").closest("[aria-live]");
    expect(exportStatus).toHaveAttribute("role", "status");
    expect(exportStatus).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/0 corpus passages/)).toBeInTheDocument();
  });

  it("disables snapshot export while another governance action is in progress", () => {
    const workspace = createGovernanceWorkspace();
    workspace.isSubmittingReviewPolicy = true;

    render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={workspace}
      />
    );

    expect(screen.getByRole("button", { name: "Export review snapshot" })).toBeDisabled();
  });

  it("marks snapshot export busy while an export is in progress", () => {
    const workspace = createGovernanceWorkspace();
    workspace.isExportingSnapshot = true;

    render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={workspace}
      />
    );

    const exportButton = screen.getByRole("button", { name: "Exporting..." });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAttribute("aria-busy", "true");
  });

  it("marks policy and review-policy submits busy while recording or updating", () => {
    const recording = createGovernanceWorkspace();
    recording.isSubmittingGovernance = true;

    const { unmount } = render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={recording}
      />
    );

    const recordButton = screen.getByRole("button", { name: "Recording..." });
    expect(recordButton).toBeDisabled();
    expect(recordButton).toHaveAttribute("aria-busy", "true");
    unmount();

    const updating = createGovernanceWorkspace();
    updating.isSubmittingReviewPolicy = true;

    render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={updating}
      />
    );

    const updateButton = screen.getByRole("button", { name: "Updating..." });
    expect(updateButton).toBeDisabled();
    expect(updateButton).toHaveAttribute("aria-busy", "true");
  });

  it("disables other disposition resolve buttons while one resolution is in flight", () => {
    const workspace = createGovernanceWorkspace();
    workspace.reviewDispositionState = {
      status: "ready",
      data: [
        {
          id: "disposition-1",
          languageId: "avenik",
          noteId: "note-1",
          disposition: "deferred",
          status: "open",
          reason: "Needs elder input.",
          assignedTo: "elder-1",
          openedAt: "2026-06-06T00:00:00.000Z",
          openedBy: "reviewer-1",
          dueAt: null,
          resolvedAt: null,
          resolvedBy: null,
          resolutionSummary: null
        },
        {
          id: "disposition-2",
          languageId: "avenik",
          noteId: "note-2",
          disposition: "escalated",
          status: "open",
          reason: "Policy conflict.",
          assignedTo: "lead-1",
          openedAt: "2026-06-07T00:00:00.000Z",
          openedBy: "reviewer-2",
          dueAt: null,
          resolvedAt: null,
          resolvedBy: null,
          resolutionSummary: null
        }
      ]
    };
    workspace.reviewDispositionDrafts = {
      "disposition-1": "Deferred pending consultation.",
      "disposition-2": "Escalated to lead reviewer."
    };
    workspace.resolvingReviewDispositionId = "disposition-1";

    render(
      <GovernanceView
        selectedLanguageId="avenik"
        governance={workspace}
      />
    );

    const resolvingButton = screen.getByRole("button", { name: "Resolving disposition-1..." });
    expect(resolvingButton).toBeDisabled();
    expect(resolvingButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Resolve disposition-2" })).toBeDisabled();
    expect(screen.getAllByText("open")).toHaveLength(2);
  });
});
