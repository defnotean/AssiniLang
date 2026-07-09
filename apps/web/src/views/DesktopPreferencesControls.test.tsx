import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopPreferencesControls } from "./DesktopPreferencesControls";

const preferences = {
  hideToTray: false,
  hideToTraySupported: true,
  launchAtLogin: false,
  launchAtLoginSupported: true
};

describe("DesktopPreferencesControls", () => {
  it("exposes aria-busy on the preference checkbox that is saving", () => {
    render(
      <DesktopPreferencesControls
        ariaLabel="Desktop preferences"
        controlsBusy
        hideToTrayOnCloseLabel="Hide to tray on close"
        launchAtSignInLabel="Launch at sign-in"
        onPreferenceChange={vi.fn()}
        preferenceBusy="launchAtLogin"
        preferences={preferences}
        savingDesktopPreferenceLabel="Saving preference…"
      />
    );

    const busyCheckbox = screen.getByLabelText("Saving preference…");
    expect(busyCheckbox).toBeDisabled();
    expect(busyCheckbox).toHaveAttribute("aria-busy", "true");

    const idleCheckbox = screen.getByLabelText("Hide to tray on close");
    expect(idleCheckbox).toBeDisabled();
    expect(idleCheckbox).not.toHaveAttribute("aria-busy");
  });
});
