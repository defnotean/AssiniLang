/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ElderContext } from "../api";
import { useElderWorkspace } from "./useElderWorkspace";

const apiMock = vi.hoisted(() => ({ fetchElderContext: vi.fn() }));

vi.mock("../api", () => ({
  fetchElderContext: (...args: unknown[]) => apiMock.fetchElderContext(...args),
  submitElderCorrection: vi.fn(),
  reviewElderCorrection: vi.fn(),
  applyElderCorrection: vi.fn()
}));

vi.mock("../i18n", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

function context(languageId: string): ElderContext {
  return { language: { id: languageId } as ElderContext["language"], corpus: [], notes: [], corrections: [], governance: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useElderWorkspace stale request guards", () => {
  beforeEach(() => apiMock.fetchElderContext.mockReset());

  it("ignores elder context from a language that was left during loading", async () => {
    const first = deferred<ElderContext>();
    const second = deferred<ElderContext>();
    apiMock.fetchElderContext.mockImplementation((languageId: string) => languageId === "avenik" ? first.promise : second.promise);
    const { result, rerender } = renderHook(
      ({ languageId }) => useElderWorkspace(languageId, true, async () => undefined, async () => undefined),
      { initialProps: { languageId: "avenik" } }
    );

    act(() => {
      rerender({ languageId: "boreal" });
    });
    act(() => first.resolve(context("avenik")));
    await waitFor(() => expect(result.current.elderContext).toBeNull());

    act(() => second.resolve(context("boreal")));
    await waitFor(() => expect(result.current.elderContext?.language.id).toBe("boreal"));
  });
});
