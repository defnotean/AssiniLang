/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPEN_CORPUS_BULK_EVENT,
  scheduleWorkspaceFocus,
  WORKSPACE_FOCUS
} from "./workspaceFocus";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("scheduleWorkspaceFocus", () => {
  it("focuses an existing element and scrolls it into view", async () => {
    const input = document.createElement("input");
    input.id = WORKSPACE_FOCUS.practiceAuthoring;
    input.scrollIntoView = vi.fn();
    document.body.appendChild(input);

    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    scheduleWorkspaceFocus(WORKSPACE_FOCUS.practiceAuthoring);

    expect(raf).toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("retries until the target mounts", () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });

    scheduleWorkspaceFocus(WORKSPACE_FOCUS.modelSetup);

    expect(rafCallbacks).toHaveLength(1);
    rafCallbacks[0]?.(0);
    expect(document.activeElement?.id).not.toBe(WORKSPACE_FOCUS.modelSetup);

    const select = document.createElement("select");
    select.id = WORKSPACE_FOCUS.modelSetup;
    select.scrollIntoView = vi.fn();
    document.body.appendChild(select);

    rafCallbacks[1]?.(0);
    expect(select).toHaveFocus();
  });

  it("dispatches the bulk-import open event before focusing", () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_CORPUS_BULK_EVENT, listener);

    const textarea = document.createElement("textarea");
    textarea.id = WORKSPACE_FOCUS.corpusBulkImport;
    textarea.scrollIntoView = vi.fn();
    document.body.appendChild(textarea);

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    scheduleWorkspaceFocus(WORKSPACE_FOCUS.corpusBulkImport);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(textarea).toHaveFocus();

    window.removeEventListener(OPEN_CORPUS_BULK_EVENT, listener);
  });
});
