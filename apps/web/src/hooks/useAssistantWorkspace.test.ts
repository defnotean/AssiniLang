/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSession } from "@assini/db";
import { useAssistantWorkspace } from "./useAssistantWorkspace";

const apiMock = vi.hoisted(() => ({ fetchAiSession: vi.fn() }));
const storageMock = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));

vi.mock("../api", () => ({
  fetchAiSession: (...args: unknown[]) => apiMock.fetchAiSession(...args),
  createAiSession: vi.fn(),
  continueAiSession: vi.fn()
}));

vi.mock("../lib/theme", () => ({
  getBrowserThemeStorage: () => storageMock
}));

vi.mock("../i18n", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

function session(languageId: string): AiSession {
  return { languageId, id: `session-${languageId}`, messages: [], trace: [] } as unknown as AiSession;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useAssistantWorkspace stale request guards", () => {
  beforeEach(() => {
    apiMock.fetchAiSession.mockReset();
    storageMock.getItem.mockImplementation((key: string) => key.endsWith("avenik") ? "session-avenik" : "session-boreal");
  });

  it("does not restore an earlier language after a reset and fast switch", async () => {
    const first = deferred<AiSession>();
    const second = deferred<AiSession>();
    apiMock.fetchAiSession.mockImplementation((id: string) => id === "session-avenik" ? first.promise : second.promise);
    const { result } = renderHook(() => useAssistantWorkspace());

    act(() => {
      void result.current.restoreSession("avenik");
    });
    act(() => {
      result.current.resetConversation("avenik");
    });
    act(() => {
      void result.current.restoreSession("boreal");
    });

    await act(async () => {
      first.resolve(session("avenik"));
      await Promise.resolve();
    });
    expect(result.current.sessionState.status).toBe("loading");

    await act(async () => {
      second.resolve(session("boreal"));
      await Promise.resolve();
    });
    expect(result.current.sessionState).toMatchObject({ status: "ready", data: { languageId: "boreal" } });
  });
});
