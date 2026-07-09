import type { DesktopPreferences } from "../lib/desktopBridge";

export type DesktopPreferenceKey = keyof Pick<DesktopPreferences, "hideToTray" | "launchAtLogin">;

type DesktopPreferencesControlsProps = {
  ariaLabel: string;
  controlsBusy: boolean;
  hideToTrayOnCloseLabel: string;
  launchAtSignInLabel: string;
  onPreferenceChange: (key: DesktopPreferenceKey, value: boolean) => Promise<void> | void;
  preferenceBusy: DesktopPreferenceKey | null;
  preferences: DesktopPreferences;
  savingDesktopPreferenceLabel: string;
};

export function DesktopPreferencesControls({
  ariaLabel,
  controlsBusy,
  hideToTrayOnCloseLabel,
  launchAtSignInLabel,
  onPreferenceChange,
  preferenceBusy,
  preferences,
  savingDesktopPreferenceLabel
}: DesktopPreferencesControlsProps) {
  return (
    <div className="desktop-preferences" role="group" aria-label={ariaLabel}>
      <label className="checkbox-row settings-checkbox" htmlFor="desktop-launch-at-login">
        <input
          id="desktop-launch-at-login"
          type="checkbox"
          checked={preferences.launchAtLogin}
          disabled={
            controlsBusy
            || preferences.launchAtLoginSupported === false
          }
          aria-busy={preferenceBusy === "launchAtLogin" || undefined}
          onChange={(event) => void onPreferenceChange("launchAtLogin", event.target.checked)}
        />
        {preferenceBusy === "launchAtLogin" ? savingDesktopPreferenceLabel : launchAtSignInLabel}
      </label>
      <label className="checkbox-row settings-checkbox" htmlFor="desktop-hide-to-tray">
        <input
          id="desktop-hide-to-tray"
          type="checkbox"
          checked={preferences.hideToTray}
          disabled={
            controlsBusy
            || preferences.hideToTraySupported === false
          }
          aria-busy={preferenceBusy === "hideToTray" || undefined}
          onChange={(event) => void onPreferenceChange("hideToTray", event.target.checked)}
        />
        {preferenceBusy === "hideToTray" ? savingDesktopPreferenceLabel : hideToTrayOnCloseLabel}
      </label>
    </div>
  );
}
