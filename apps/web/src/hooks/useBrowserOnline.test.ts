/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { useBrowserOnline } from "./useBrowserOnline";

describe("useBrowserOnline", () => {
  let onlineDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  });

  afterEach(() => {
    if (onlineDescriptor) {
      Object.defineProperty(window.navigator, "onLine", onlineDescriptor);
    }
  });

  it("starts from navigator.onLine and reacts to offline/online events", () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => true
    });

    const { result } = renderHook(() => useBrowserOnline());
    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        get: () => false
      });
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        get: () => true
      });
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});
