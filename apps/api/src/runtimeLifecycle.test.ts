import { describe, expect, it, vi } from "vitest";
import { registerShutdownHandlers } from "./runtimeLifecycle.js";

describe("registerShutdownHandlers", () => {
  function createSignalHarness() {
    const handlers = new Map<string, Array<() => void>>();
    return {
      on(signal: string, handler: () => void) {
        handlers.set(signal, [...(handlers.get(signal) ?? []), handler]);
      },
      emit(signal: string) {
        for (const handler of handlers.get(signal) ?? []) {
          handler();
        }
      },
      count(signal: string) {
        return handlers.get(signal)?.length ?? 0;
      }
    };
  }

  it("registers SIGINT and SIGTERM handlers that close the app", async () => {
    const processLike = createSignalHarness();
    const app = { close: vi.fn(async () => undefined) };

    registerShutdownHandlers({ app, processLike });
    processLike.emit("SIGTERM");
    await vi.waitFor(() => expect(app.close).toHaveBeenCalledTimes(1));

    expect(processLike.count("SIGINT")).toBe(1);
    expect(processLike.count("SIGTERM")).toBe(1);
  });

  it("closes at most once when multiple signals arrive", async () => {
    const processLike = createSignalHarness();
    const app = { close: vi.fn(async () => undefined) };

    registerShutdownHandlers({ app, processLike });
    processLike.emit("SIGTERM");
    processLike.emit("SIGINT");
    await vi.waitFor(() => expect(app.close).toHaveBeenCalledTimes(1));
  });
});
