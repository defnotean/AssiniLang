import type { Note } from "@assini/db";
import { formatStatus } from "../lib/format";
import { useI18n } from "../i18n";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const label = formatStatus(status, t);
  return (
    <span className={`status-badge ${status}`} role="status" aria-label={label}>
      {label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Note["confidence"] }) {
  const { t } = useI18n();
  const label = t(`confidence.${confidence}`);
  return (
    <span className={`confidence-badge ${confidence}`} role="status" aria-label={label}>
      {label}
    </span>
  );
}
