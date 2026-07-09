import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopActionGroups } from "./DesktopActionGroups";

describe("DesktopActionGroups", () => {
  it("exposes aria-busy on the in-flight action and leaves idle siblings unmarked", () => {
    const onCopy = vi.fn();
    const onSave = vi.fn();

    render(
      <DesktopActionGroups
        ariaLabel="Desktop actions"
        groups={[
          {
            id: "diagnostics",
            label: "Diagnostics",
            buttons: [
              {
                key: "copyDiagnostics",
                label: "Copying diagnostics…",
                busy: true,
                disabled: true,
                onClick: onCopy
              },
              {
                key: "saveDiagnosticsReport",
                label: "Save diagnostics report",
                disabled: true,
                onClick: onSave
              }
            ]
          }
        ]}
      />
    );

    const busyButton = screen.getByRole("button", { name: "Copying diagnostics…" });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute("aria-busy", "true");

    const idleButton = screen.getByRole("button", { name: "Save diagnostics report" });
    expect(idleButton).toBeDisabled();
    expect(idleButton).not.toHaveAttribute("aria-busy");
  });

  it("invokes the clicked action when the control is idle", () => {
    const onReset = vi.fn();

    render(
      <DesktopActionGroups
        ariaLabel="Desktop actions"
        groups={[
          {
            id: "recovery",
            label: "Recovery",
            buttons: [
              {
                key: "resetWindowLayout",
                label: "Reset window layout",
                onClick: onReset
              }
            ]
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset window layout" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
