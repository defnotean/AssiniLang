export function StatusScreen({
  kind,
  message,
  hint,
  onRetry,
  retryLabel
}: {
  kind: "loading" | "error";
  message: string;
  hint?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  if (kind === "loading") {
    return (
      <div className="full-page-status" role="status" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        {message}
      </div>
    );
  }

  return (
    <div className="full-page-status error" role="alert">
      <p>{message}</p>
      {hint && <p className="muted">{hint}</p>}
      {onRetry && retryLabel && (
        <button type="button" className="secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
