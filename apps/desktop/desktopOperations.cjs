const {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} = require("node:fs");
const path = require("node:path");

const SHORTCUT_NAME = "AssiniLang.lnk";
const BACKUP_RETENTION_COUNT = 5;
const DIAGNOSTICS_REPORT_MAX_CHARS = 200_000;

function createDesktopOperations({
  app,
  desktopAppMetadata,
  desktopIpcErrors,
  desktopIpcFailure,
  getDesktopRuntime,
  getMainWindow,
  normalizeDiagnosticsReportText,
  shell,
  updateDesktopBridge
}) {
  function actionResult(message) {
    return { ok: true, message };
  }
  function backupRootPath() {
    if (!getDesktopRuntime()) {
      throw new Error("Desktop runtime paths are not ready yet.");
    }
    return getDesktopRuntime().backupsDir;
  }

  function diagnosticsRootPath() {
    if (!getDesktopRuntime()) {
      throw new Error("Desktop runtime paths are not ready yet.");
    }
    return getDesktopRuntime().diagnosticsDir;
  }

  async function openDesktopPath(target) {
    if (target === "appFolder") {
      const folder = desktopAppMetadata().appFolder;
      const error = await shell.openPath(folder);
      if (error) {
        throw new Error(error);
      }
      return actionResult("Opened app folder.");
    }

    if (!getDesktopRuntime()) {
      throw new Error("Desktop runtime paths are not ready yet.");
    }

    const folder =
      target === "settingsFolder"
        ? getDesktopRuntime().userDataDir
        : target === "backupsFolder"
          ? backupRootPath()
          : target === "diagnosticsFolder"
            ? diagnosticsRootPath()
            : getDesktopRuntime().dataDir;
    mkdirSync(folder, { recursive: true });
    const error = await shell.openPath(folder);
    if (error) {
      throw new Error(error);
    }

    if (target === "settingsFolder") return actionResult("Opened settings folder.");
    if (target === "backupsFolder") return actionResult("Opened backups folder.");
    if (target === "diagnosticsFolder") return actionResult("Opened diagnostics folder.");
    return actionResult("Opened data folder.");
  }

  async function saveDesktopDiagnosticsReport(text) {
    const normalized = normalizeDiagnosticsReportText(text, DIAGNOSTICS_REPORT_MAX_CHARS);
    if (!normalized.ok) {
      return normalized;
    }

    const diagnosticsDir = diagnosticsRootPath();
    mkdirSync(diagnosticsDir, { recursive: true });
    const reportText = normalized.usedFallback
      ? `AssiniLang Desktop diagnostics\nGenerated: ${new Date().toISOString()}\n`
      : normalized.text;
    const reportPath = path.join(diagnosticsDir, `diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
    writeFileSync(reportPath, reportText, "utf8");
    return {
      ...actionResult(`Saved diagnostics report at ${reportPath}`),
      diagnosticsDir,
      diagnosticsPath: reportPath,
      truncated: Boolean(normalized.truncated)
    };
  }

  async function openLatestBackupFolder() {
    const { pickPreferredRestoreBackup } = require("./backupRestore.cjs");
    const latest = pickPreferredRestoreBackup(restorableBackups());
    if (!latest) {
      return {
        ok: false,
        message: "No desktop data backup is available yet.",
        backupSummary: desktopBackupSummary()
      };
    }

    const error = await shell.openPath(latest.path);
    if (error) {
      throw new Error(error);
    }

    return {
      ...actionResult(`Opened latest backup ${latest.name}.`),
      backupSummary: desktopBackupSummary()
    };
  }

  function shortcutOptions() {
    return {
      target: process.execPath,
      cwd: path.dirname(process.execPath),
      description: "Open AssiniLang Desktop",
      icon: process.execPath,
      iconIndex: 0
    };
  }

  function createWindowsShortcut(shortcutPath) {
    mkdirSync(path.dirname(shortcutPath), { recursive: true });
    const created = shell.writeShortcutLink(shortcutPath, "create", shortcutOptions());
    if (!created) {
      throw new Error("Windows did not create the shortcut.");
    }
    return shortcutPath;
  }

  function startMenuProgramsPath() {
    if (!process.env.APPDATA) {
      throw new Error("APPDATA is not available for Start Menu shortcut creation.");
    }
    return path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
  }

  function desktopShortcutPath() {
    return path.join(app.getPath("desktop"), SHORTCUT_NAME);
  }

  function startMenuShortcutPath() {
    return path.join(startMenuProgramsPath(), SHORTCUT_NAME);
  }

  function desktopShortcutSummary() {
    const desktopPath = desktopShortcutPath();
    let startMenuPath;
    try {
      startMenuPath = startMenuShortcutPath();
    } catch {
      startMenuPath = undefined;
    }

    return {
      desktopExists: existsSync(desktopPath),
      desktopPath,
      startMenuExists: typeof startMenuPath === "string" && existsSync(startMenuPath),
      startMenuPath
    };
  }

  function refreshDesktopBridgeShortcutSummary() {
    const shortcutSummary = desktopShortcutSummary();
    updateDesktopBridge({ shortcutSummary });
    return shortcutSummary;
  }
  async function createDesktopShortcut() {
    if (!app.isPackaged) {
      return desktopIpcFailure(desktopIpcErrors.SHORTCUT_PACKAGED_ONLY, {
        message: "Desktop shortcut creation is available in the packaged app."
      });
    }

    const shortcutPath = createWindowsShortcut(desktopShortcutPath());

    return {
      ...actionResult(`Created ${shortcutPath}`),
      shortcutSummary: refreshDesktopBridgeShortcutSummary()
    };
  }

  async function createStartMenuShortcut() {
    if (!app.isPackaged) {
      return desktopIpcFailure(desktopIpcErrors.SHORTCUT_PACKAGED_ONLY, {
        message: "Start Menu shortcut creation is available in the packaged app."
      });
    }

    const shortcutPath = createWindowsShortcut(startMenuShortcutPath());

    return {
      ...actionResult(`Created ${shortcutPath}`),
      shortcutSummary: refreshDesktopBridgeShortcutSummary()
    };
  }

  async function createAppShortcuts() {
    if (!app.isPackaged) {
      return desktopIpcFailure(desktopIpcErrors.SHORTCUT_PACKAGED_ONLY);
    }

    const desktopPath = createWindowsShortcut(desktopShortcutPath());
    const startMenuPath = createWindowsShortcut(startMenuShortcutPath());

    return {
      ...actionResult(`Created app shortcuts: ${desktopPath}; ${startMenuPath}`),
      shortcutSummary: refreshDesktopBridgeShortcutSummary()
    };
  }

  function assertChildPathInside(parentPath, targetPath, label) {
    const parent = path.resolve(parentPath);
    const target = path.resolve(targetPath);
    const relative = path.relative(parent, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`${label} is outside the expected desktop data folder.`);
    }
    return target;
  }

  function desktopBackupName(prefix = "backup") {
    return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  }

  async function createDataBackup(options = {}) {
    if (!getDesktopRuntime()) {
      throw new Error("Desktop runtime paths are not ready yet.");
    }

    // Validate the live workspace before copying (parity with CLI db:backup).
    try {
      const { assertDesktopLiveDbReadable } = require("./backupRestore.cjs");
      const { JsonStore } = await import("@assini/db");
      await assertDesktopLiveDbReadable(getDesktopRuntime().dbPath, {
        readWorkspace: async (dbPath) => {
          await new JsonStore(dbPath).read();
        }
      });
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        backupSummary: desktopBackupSummary()
      };
    }

    const backupPath = path.join(backupRootPath(), desktopBackupName(options.prefix));
    mkdirSync(backupPath, { recursive: true });

    if (existsSync(getDesktopRuntime().dataDir)) {
      cpSync(getDesktopRuntime().dataDir, path.join(backupPath, "data"), {
        recursive: true,
        force: true,
        errorOnExist: false
      });
    }
    if (getDesktopRuntime().settingsPath && existsSync(getDesktopRuntime().settingsPath)) {
      cpSync(getDesktopRuntime().settingsPath, path.join(backupPath, ".env"), {
        force: true,
        errorOnExist: false
      });
    }

    writeFileSync(
      path.join(backupPath, "backup-manifest.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          dataDir: getDesktopRuntime().dataDir,
          dbPath: getDesktopRuntime().dbPath,
          settingsPath: getDesktopRuntime().settingsPath
        },
        null,
        2
      )
    );

    return {
      ...actionResult(`Created backup at ${backupPath}`),
      backupPath,
      backupSummary: desktopBackupSummary()
    };
  }

  function restorableBackups() {
    const { isRestorableBackupName } = require("./backupRestore.cjs");
    const backupRoot = backupRootPath();
    mkdirSync(backupRoot, { recursive: true });
    const resolvedBackupRoot = path.resolve(backupRoot);

    return readdirSync(backupRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isRestorableBackupName(entry.name))
      .map((entry) => {
        const backupPath = assertChildPathInside(
          resolvedBackupRoot,
          path.join(backupRoot, entry.name),
          "Backup folder"
        );
        let manifest = {};
        try {
          manifest = JSON.parse(readFileSync(path.join(backupPath, "backup-manifest.json"), "utf8"));
        } catch {
          manifest = {};
        }
        return {
          createdAt: typeof manifest.createdAt === "string" ? manifest.createdAt : undefined,
          name: entry.name,
          path: backupPath,
          stat: statSync(backupPath)
        };
      })
      .filter(
        (entry) =>
          existsSync(path.join(entry.path, "backup-manifest.json")) && existsSync(path.join(entry.path, "data"))
      )
      .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || right.name.localeCompare(left.name));
  }

  function desktopBackupSummary() {
    const { pickPreferredRestoreBackup } = require("./backupRestore.cjs");
    const backups = restorableBackups();
    // Surface the same preferred target restore-latest would use (routine first).
    const latest = pickPreferredRestoreBackup(backups);
    return {
      backupsDir: backupRootPath(),
      count: backups.length,
      latestCreatedAt: latest?.createdAt,
      latestName: latest?.name,
      latestPath: latest?.path
    };
  }

  async function pruneOldDataBackups() {
    const { isSafetyBackupName } = require("./backupRestore.cjs");
    // Keep safety-before-restore copies outside the routine retention window.
    const backups = restorableBackups().filter((entry) => !isSafetyBackupName(entry.name));
    const prunable = backups.slice(BACKUP_RETENTION_COUNT);
    if (prunable.length === 0) {
      return {
        ok: true,
        message: `No old backups to prune. Keeping the newest ${BACKUP_RETENTION_COUNT}.`,
        backupSummary: desktopBackupSummary()
      };
    }

    const backupRoot = path.resolve(backupRootPath());
    for (const backup of prunable) {
      const backupPath = assertChildPathInside(backupRoot, backup.path, "Backup folder");
      rmSync(backupPath, { recursive: true, force: true });
    }

    return {
      ok: true,
      message: `Pruned ${prunable.length} old backup${prunable.length === 1 ? "" : "s"}.`,
      backupSummary: desktopBackupSummary()
    };
  }

  const desktopRestoreLock = (() => {
    const { createDesktopRestoreLock } = require("./backupRestore.cjs");
    return createDesktopRestoreLock();
  })();

  async function restoreLatestDataBackup() {
    if (!getDesktopRuntime()) {
      throw new Error("Desktop runtime paths are not ready yet.");
    }

    try {
      return await desktopRestoreLock.run(async () => {
        const {
          SAFETY_BACKUP_PREFIX,
          assertBackupDistinctFromLive,
          assertDesktopBackupReadable,
          assertSafetyBackupBeforeRestore,
          pickPreferredRestoreBackup,
          replaceLiveDesktopDataFromBackup
        } = require("./backupRestore.cjs");

        // Prefer newest routine backup so a just-created safety copy is not the default.
        const latest = pickPreferredRestoreBackup(restorableBackups());
        if (!latest) {
          return {
            ok: false,
            message: "No desktop data backup is available to restore.",
            backupSummary: desktopBackupSummary()
          };
        }

        const userDataDir = path.resolve(getDesktopRuntime().userDataDir);
        const targetDataDir = assertChildPathInside(userDataDir, getDesktopRuntime().dataDir, "Desktop data folder");
        const targetSettingsPath = getDesktopRuntime().settingsPath
          ? assertChildPathInside(userDataDir, getDesktopRuntime().settingsPath, "Desktop settings file")
          : null;
        assertChildPathInside(latest.path, path.join(latest.path, "data"), "Backup data folder");
        assertChildPathInside(latest.path, path.join(latest.path, ".env"), "Backup settings file");

        try {
          assertBackupDistinctFromLive(latest.path, targetDataDir);
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            backupSummary: desktopBackupSummary()
          };
        }

        // Validate the backup database before touching live data (matches CLI restoreFrom).
        try {
          const { JsonStore } = await import("@assini/db");
          await assertDesktopBackupReadable(latest.path, {
            readWorkspace: async (dbPath) => {
              await new JsonStore(dbPath).read();
            }
          });
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            backupSummary: desktopBackupSummary()
          };
        }

        let safetyBackupPath = null;
        try {
          const safety = await assertSafetyBackupBeforeRestore(() =>
            createDataBackup({ prefix: SAFETY_BACKUP_PREFIX })
          );
          safetyBackupPath = typeof safety.backupPath === "string" ? safety.backupPath : null;
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            backupSummary: desktopBackupSummary()
          };
        }

        try {
          replaceLiveDesktopDataFromBackup({
            sourceBackupDir: latest.path,
            targetDataDir,
            targetSettingsPath,
            safetyBackupDir: safetyBackupPath,
            copyTree: (sourcePath, targetPath) => {
              if (existsSync(targetPath)) {
                rmSync(targetPath, { recursive: true, force: true });
              }
              cpSync(sourcePath, targetPath, {
                recursive: true,
                force: true,
                errorOnExist: false
              });
            }
          });
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            backupSummary: desktopBackupSummary(),
            recoveredFromSafety: Boolean(error && error.recoveredFromSafety)
          };
        }

        if (getMainWindow() && !getMainWindow().isDestroyed()) {
          setTimeout(() => {
            if (getMainWindow() && !getMainWindow().isDestroyed()) {
              getMainWindow().webContents.reload();
            }
          }, 1200);
        }

        return {
          ...actionResult(`Restored latest backup ${latest.name}. Reloading workspace...`),
          backupSummary: desktopBackupSummary()
        };
      });
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        backupSummary: desktopBackupSummary()
      };
    }
  }

  return {
    createAppShortcuts,
    createDataBackup,
    createDesktopShortcut,
    createStartMenuShortcut,
    desktopBackupSummary,
    desktopShortcutSummary,
    openDesktopPath,
    openLatestBackupFolder,
    pruneOldDataBackups,
    refreshDesktopBridgeShortcutSummary,
    restoreLatestDataBackup,
    saveDesktopDiagnosticsReport
  };
}

module.exports = { createDesktopOperations };
