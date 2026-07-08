export function StatusScreen({
  kind,
  message,
  onRetry,
  retryLabel
}: {
  kind: "loading" | "error";
  message: string;
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
      {onRetry && (
        <button type="button" className="secondary" onClick={onRetry}>
          {retryLabel ?? "Retry"}
        </button>
      )}
    </div>
  );
}
