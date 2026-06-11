type ClosableApp = {
  close: () => Promise<unknown>;
};

type ProcessLike = {
  on: (signal: "SIGINT" | "SIGTERM", handler: () => void) => unknown;
  exit?: (code?: number) => never;
};

export function registerShutdownHandlers({
  app,
  processLike = process
}: {
  app: ClosableApp;
  processLike?: ProcessLike;
}) {
  let closing = false;

  const close = () => {
    if (closing) return;
    closing = true;
    void app.close()
      .then(() => processLike.exit?.(0))
      .catch(() => processLike.exit?.(1));
  };

  processLike.on("SIGINT", close);
  processLike.on("SIGTERM", close);
}
