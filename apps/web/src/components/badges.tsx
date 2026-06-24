import type { Note } from "@assini/db";
import { formatStatus } from "../lib/format";
import { useI18n } from "../i18n";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${status}`}>{formatStatus(status)}</span>;
}

export function ConfidenceBadge({ confidence }: { confidence: Note["confidence"] }) {
  const { t } = useI18n();
  return <span className={`confidence-badge ${confidence}`}>{t(`confidence.${confidence}`)}</span>;
}
