import type { Note } from "@assini/db";
import { formatStatus } from "../lib/format";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${status}`}>{formatStatus(status)}</span>;
}

export function ConfidenceBadge({ confidence }: { confidence: Note["confidence"] }) {
  return <span className={`confidence-badge ${confidence}`}>{confidence} confidence</span>;
}
