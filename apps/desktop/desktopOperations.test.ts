import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createDesktopOperations } = require("./desktopOperations.cjs") as {
  createDesktopOperations: (options: Record<string, unknown>) => {
    desktopBackupSummary: () => Record<string, unknown>;
    openDesktopPath: (target: string) => Promise<Record<string, unknown>>;
    saveDesktopDiagnosticsReport: (text: string) => Promise<Record<string, unknown>>;
  };
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("desktop operations", () => {
  it("keeps backup, folder, and diagnostics operations inside injected runtime paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "assini-desktop-operations-"));
    temporaryRoots.push(root);
    const runtime = {
      backupsDir: join(root, "backups"),
      dataDir: join(root, "data"),
      dbPath: join(root, "data", "local-db.sqlite"),
      diagnosticsDir: join(root, "diagnostics"),
      settingsPath: join(root, ".env"),
      userDataDir: root
    };
    const openPath = vi.fn(async () => "");
    const operations = createDesktopOperations({
      app: { getPath: () => root, isPackaged: false },
      desktopAppMetadata: () => ({ appFolder: root, appPath: join(root, "AssiniLang.exe") }),
      desktopIpcErrors: {},
      desktopIpcFailure: vi.fn(),
      getDesktopRuntime: () => runtime,
      getMainWindow: () => null,
      normalizeDiagnosticsReportText: (text: string) => ({
        ok: true,
        text,
        truncated: false,
        usedFallback: false
      }),
      shell: { openPath, writeShortcutLink: vi.fn() },
      updateDesktopBridge: vi.fn()
    });

    expect(operations.desktopBackupSummary()).toMatchObject({
      backupsDir: runtime.backupsDir,
      count: 0
    });
    await expect(operations.openDesktopPath("backupsFolder")).resolves.toMatchObject({ ok: true });
    expect(openPath).toHaveBeenCalledWith(runtime.backupsDir);

    const report = await operations.saveDesktopDiagnosticsReport("safe diagnostics");
    expect(report).toMatchObject({ ok: true, diagnosticsDir: runtime.diagnosticsDir, truncated: false });
    expect(await readdir(runtime.diagnosticsDir)).toHaveLength(1);
  });
});
