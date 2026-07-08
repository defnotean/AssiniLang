import type { AuditEvent, GovernanceRecord, ReviewDisposition, ReviewPolicy } from "@assini/db";
import { actorJsonRequest, getJson } from "../lib/apiClient";

export type GovernancePayload = Pick<GovernanceRecord, "languageId" | "policyType" | "content" | "effectiveDate">;
export type ReviewPolicyPayload = Pick<ReviewPolicy, "assignedReviewerIds" | "approvalThreshold" | "requiresAssignedReviewer">;

export async function fetchGovernance(): Promise<GovernanceRecord[]> {
  return getJson<GovernanceRecord[]>("/governance", "reviewer");
}

export async function createGovernanceRecord(payload: GovernancePayload): Promise<GovernanceRecord> {
  return actorJsonRequest<GovernanceRecord>("elder", "/api/governance", {
    method: "POST",
    body: JSON.stringify(payload)
  }, "Governance policy creation failed");
}

export async function fetchAuditEvents(languageId: string): Promise<AuditEvent[]> {
  return getJson<AuditEvent[]>(`/audit/events?languageId=${encodeURIComponent(languageId)}`, "programmer");
}

export async function fetchReviewPolicy(languageId: string): Promise<ReviewPolicy> {
  return getJson<ReviewPolicy>(`/languages/${encodeURIComponent(languageId)}/review-policy`, "reviewer");
}

export async function updateReviewPolicy(languageId: string, payload: ReviewPolicyPayload): Promise<ReviewPolicy> {
  return actorJsonRequest<ReviewPolicy>("reviewer", `/api/languages/${encodeURIComponent(languageId)}/review-policy`, {
    method: "PUT",
    body: JSON.stringify(payload)
  }, "Review policy update failed");
}

export async function fetchReviewDispositions(languageId: string): Promise<ReviewDisposition[]> {
  return getJson<ReviewDisposition[]>(
    `/languages/${encodeURIComponent(languageId)}/review-dispositions`,
    "reviewer"
  );
}

export async function resolveReviewDisposition(
  dispositionId: string,
  resolutionSummary: string
): Promise<ReviewDisposition> {
  return actorJsonRequest<ReviewDisposition>("reviewer", "/api/review-dispositions/resolve", {
    method: "PATCH",
    body: JSON.stringify({ dispositionId, resolutionSummary })
  }, "Review disposition resolution failed");
}
