export function StatusScreen({ kind, message }: { kind: "loading" | "error"; message: string }) {
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
      {message}
    </div>
  );
}
