import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignOutButton } from "./SignOutButton";

const closePrototypeSession = vi.fn();

vi.mock("../api", () => ({
  closePrototypeSession: (...args: unknown[]) => closePrototypeSession(...args)
}));

describe("SignOutButton", () => {
  afterEach(() => {
    closePrototypeSession.mockReset();
    vi.unstubAllGlobals();
  });

  it("marks the control busy while signing out, then reloads", async () => {
    let resolveSignOut: () => void = () => undefined;
    closePrototypeSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        })
    );
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    render(<SignOutButton />);

    const button = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "Signing out…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Signing out…" })).toHaveAttribute("aria-busy", "true");
    expect(closePrototypeSession).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();

    resolveSignOut();
    await waitFor(() => {
      expect(reload).toHaveBeenCalledOnce();
    });
  });

  it("still reloads when prototype sign-out fails", async () => {
    closePrototypeSession.mockRejectedValue(new Error("session store unavailable"));
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(reload).toHaveBeenCalledOnce();
    });
  });
});
