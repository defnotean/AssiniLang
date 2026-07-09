import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesktopAppDetails } from "./DesktopAppDetails";

const desktopBridge = {
  appVersion: "0.1.0",
  appFolder: "C:\\Programs\\AssiniLang",
  dataDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data",
  settingsPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env",
  backupsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups",
  diagnosticsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics",
  isPackaged: true
};

describe("DesktopAppDetails backup summary", () => {
  it("shows an empty backup state when no backups exist yet", () => {
    render(
      <DesktopAppDetails
        desktopBackupSummary={{
          backupsDir: desktopBridge.backupsDir!,
          count: 0,
          latestCreatedAt: undefined,
          latestName: undefined,
          latestPath: undefined
        }}
        desktopBridge={desktopBridge}
        desktopShortcutSummary={null}
      />
    );

    expect(screen.getByText("No backups yet")).toBeInTheDocument();
    expect(screen.getByText("Create a data backup before risky experiments. Restore stays disabled until one exists.")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-backup-summary='empty']")).toBeInTheDocument();
    expect(screen.queryByText("0 backups")).not.toBeInTheDocument();
  });

  it("shows the latest backup details when backups exist", () => {
    render(
      <DesktopAppDetails
        desktopBackupSummary={{
          backupsDir: desktopBridge.backupsDir!,
          count: 2,
          latestCreatedAt: "2026-07-07T20:00:00.000Z",
          latestName: "backup-2026-07-07T20-00-00-000Z",
          latestPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups\\backup-2026-07-07T20-00-00-000Z"
        }}
        desktopBridge={desktopBridge}
        desktopShortcutSummary={null}
      />
    );

    expect(screen.getByText("2 backups")).toBeInTheDocument();
    expect(screen.getByText("backup-2026-07-07T20-00-00-000Z")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-backup-summary='empty']")).not.toBeInTheDocument();
  });
});
