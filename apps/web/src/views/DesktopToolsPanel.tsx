import { useEffect, useState } from "react";
import type {
  DiscoveredLlmModel,
  LlmModelDiscoveryResponse,
  LlmStatus,
  ObservabilityData,
  RuntimeSettingsResponse
} from "../api";
import {
  getDesktopBridgeInfo,
  refreshDesktopBackupSummary,
  refreshDesktopShortcutSummary,
  runDesktopAction,
  saveDesktopDiagnosticsReport,
  setDesktopPreferences,
  type DesktopAction,
  type DesktopBackupSummary,
  type DesktopPreferences,
  type DesktopShortcutSummary
} from "../lib/desktopBridge";
import { buildDesktopDiagnosticsText } from "../lib/desktopDiagnostics";
import type { AsyncState } from "../lib/types";
import { useI18n, type MessageKey } from "../i18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DesktopActionGroups, type DesktopActionGroup } from "./DesktopActionGroups";
import { DesktopAppDetails } from "./DesktopAppDetails";
import { DesktopPreferencesControls, type DesktopPreferenceKey } from "./DesktopPreferencesControls";

type DesktopActionNotice = {
  kind: "success" | "error";
  message: string;
};

type PendingDesktopConfirm = {
  action: DesktopAction;
  message: string;
};

type DesktopActionButtonConfig = {
  disabled?: boolean;
  isBusy?: boolean;
  key: string;
  labelKey: MessageKey;
  busyLabelKey?: MessageKey;
  onClick: () => void;
};

type DesktopToolsPanelProps = {
  connectedEndpointCount: number;
  discoveryEndpoints: LlmModelDiscoveryResponse["endpoints"];
  discoveryErrorCount: number;
  discoveredModels: DiscoveredLlmModel[];
  failedEndpointCount: number;
  lastModelScan: string | null;
  modelDiscoveryState: AsyncState<LlmModelDiscoveryResponse>;
  observabilityState: AsyncState<ObservabilityData>;
  settings: RuntimeSettingsResponse["settings"] | null;
  status: LlmStatus;
};

export function DesktopToolsPanel({
  connectedEndpointCount,
  discoveryEndpoints,
  discoveryErrorCount,
  discoveredModels,
  failedEndpointCount,
  lastModelScan,
  modelDiscoveryState,
  observabilityState,
  settings,
  status
}: DesktopToolsPanelProps) {
  const { t } = useI18n();
  const [desktopActionBusy, setDesktopActionBusy] = useState<DesktopAction | null>(null);
  const [desktopActionNotice, setDesktopActionNotice] = useState<DesktopActionNotice | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingDesktopConfirm | null>(null);
  const [desktopPreferenceBusy, setDesktopPreferenceBusy] = useState<DesktopPreferenceKey | null>(null);
  const [isCopyingDiagnostics, setIsCopyingDiagnostics] = useState(false);
  const [isSavingDiagnostics, setIsSavingDiagnostics] = useState(false);
  const desktopBridge = getDesktopBridgeInfo();
  const [desktopBackupSummary, setDesktopBackupSummary] = useState<DesktopBackupSummary | null>(
    () => desktopBridge?.backupSummary ?? null
  );
  const [desktopShortcutSummary, setDesktopShortcutSummary] = useState<DesktopShortcutSummary | null>(
    () => desktopBridge?.shortcutSummary ?? null
  );
  const [desktopPreferences, setDesktopPreferencesState] = useState<DesktopPreferences | null>(
    () => desktopBridge?.preferences ?? null
  );
  const desktopControlsBusy = desktopActionBusy !== null
    || desktopPreferenceBusy !== null
    || isCopyingDiagnostics
    || isSavingDiagnostics;

  useEffect(() => {
    setDesktopBackupSummary(desktopBridge?.backupSummary ?? null);
  }, [
    desktopBridge?.backupSummary?.backupsDir,
    desktopBridge?.backupSummary?.count,
    desktopBridge?.backupSummary?.latestCreatedAt,
    desktopBridge?.backupSummary?.latestName,
    desktopBridge?.backupSummary?.latestPath
  ]);

  useEffect(() => {
    setDesktopShortcutSummary(desktopBridge?.shortcutSummary ?? null);
  }, [
    desktopBridge?.shortcutSummary?.desktopExists,
    desktopBridge?.shortcutSummary?.desktopPath,
    desktopBridge?.shortcutSummary?.startMenuExists,
    desktopBridge?.shortcutSummary?.startMenuPath
  ]);

  useEffect(() => {
    if (!desktopBridge) return;
    let cancelled = false;
    void refreshDesktopBackupSummary().then((result) => {
      if (!cancelled && result.backupSummary) {
        setDesktopBackupSummary(result.backupSummary);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [desktopBridge?.backupsDir]);

  useEffect(() => {
    if (!desktopBridge) return;
    let cancelled = false;
    void refreshDesktopShortcutSummary().then((result) => {
      if (!cancelled && result.shortcutSummary) {
        setDesktopShortcutSummary(result.shortcutSummary);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [desktopBridge?.isPackaged]);

  useEffect(() => {
    setDesktopPreferencesState(desktopBridge?.preferences ?? null);
  }, [
    desktopBridge?.preferences?.hideToTray,
    desktopBridge?.preferences?.hideToTraySupported,
    desktopBridge?.preferences?.launchAtLogin,
    desktopBridge?.preferences?.launchAtLoginSupported
  ]);

  if (!desktopBridge) {
    return null;
  }

  function buildDiagnosticsText(): string {
    return buildDesktopDiagnosticsText({
      connectedEndpointCount,
      desktopBackupSummary,
      desktopBridge,
      desktopPreferences,
      desktopShortcutSummary,
      discoveryEndpoints,
      discoveryErrorCount,
      discoveredModels,
      failedEndpointCount,
      generatedAt: new Date().toISOString(),
      lastModelScan,
      modelDiscoveryState,
      observabilityState,
      settings,
      status
    });
  }

  async function handleCopyDiagnostics() {
    const clipboard = typeof window === "undefined" ? undefined : window.navigator.clipboard;
    if (!clipboard?.writeText) {
      setDesktopActionNotice({
        kind: "error",
        message: t("model.diagnosticsCopyUnavailable")
      });
      return;
    }

    setIsCopyingDiagnostics(true);
    setDesktopActionNotice(null);
    try {
      await clipboard.writeText(buildDiagnosticsText());
      setDesktopActionNotice({
        kind: "success",
        message: t("model.diagnosticsCopied")
      });
    } catch (error) {
      setDesktopActionNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("model.diagnosticsCopyFailed")
      });
    } finally {
      setIsCopyingDiagnostics(false);
    }
  }

  async function handleSaveDiagnosticsReport() {
    setIsSavingDiagnostics(true);
    setDesktopActionNotice(null);
    try {
      const result = await saveDesktopDiagnosticsReport(buildDiagnosticsText());
      setDesktopActionNotice({
        kind: result.ok ? "success" : "error",
        message: result.i18nKey
          ? t(result.i18nKey)
          : (result.message ?? (result.ok ? t("model.diagnosticsSaved") : t("model.diagnosticsSaveFailed")))
      });
    } catch (error) {
      setDesktopActionNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("model.diagnosticsSaveFailed")
      });
    } finally {
      setIsSavingDiagnostics(false);
    }
  }

  async function handleDesktopPreferenceChange(
    key: DesktopPreferenceKey,
    value: boolean
  ) {
    setDesktopPreferenceBusy(key);
    setDesktopActionNotice(null);
    try {
      const result = await setDesktopPreferences({ [key]: value });
      if (result.preferences) {
        setDesktopPreferencesState(result.preferences);
      }
      setDesktopActionNotice({
        kind: result.ok ? "success" : "error",
        message: result.i18nKey
          ? t(result.i18nKey)
          : (result.message ?? (result.ok ? t("model.desktopPreferenceSaved") : t("model.desktopPreferenceFailed")))
      });
    } catch (error) {
      setDesktopActionNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("model.desktopPreferenceFailed")
      });
    } finally {
      setDesktopPreferenceBusy(null);
    }
  }

  async function handleDesktopAction(action: DesktopAction) {
    setDesktopActionBusy(action);
    setDesktopActionNotice(null);
    try {
      const result = await runDesktopAction(action);
      if (result.backupSummary) {
        setDesktopBackupSummary(result.backupSummary);
      }
      if (result.shortcutSummary) {
        setDesktopShortcutSummary(result.shortcutSummary);
      }
      setDesktopActionNotice({
        kind: result.ok ? "success" : "error",
        message: result.i18nKey
          ? t(result.i18nKey)
          : (result.message ?? (result.ok ? t("model.desktopActionComplete") : t("model.desktopActionFailed")))
      });
    } catch (error) {
      setDesktopActionNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("model.desktopActionFailed")
      });
    } finally {
      setDesktopActionBusy(null);
    }
  }

  function requestDesktopConfirm(action: DesktopAction, message: string) {
    setPendingConfirm({ action, message });
  }

  function handleRestoreLatestBackup() {
    requestDesktopConfirm("restoreLatestDataBackup", t("model.restoreBackupConfirm"));
  }

  function handlePruneOldBackups() {
    requestDesktopConfirm("pruneOldDataBackups", t("model.pruneBackupsConfirm"));
  }

  function desktopButton({
    busyLabelKey,
    disabled = desktopControlsBusy,
    isBusy = false,
    key,
    labelKey,
    onClick
  }: DesktopActionButtonConfig) {
    return {
      busy: isBusy,
      disabled,
      key,
      label: isBusy && busyLabelKey ? t(busyLabelKey) : t(labelKey),
      onClick
    };
  }

  function desktopActionButton(
    action: DesktopAction,
    labelKey: MessageKey,
    busyLabelKey: MessageKey,
    disabled = desktopControlsBusy
  ) {
    return desktopButton({
      key: action,
      labelKey,
      busyLabelKey,
      disabled,
      isBusy: desktopActionBusy === action,
      onClick: () => void handleDesktopAction(action)
    });
  }

  const desktopActionGroups: DesktopActionGroup[] = [
    {
      id: "recovery",
      label: t("model.desktopGroupRecovery"),
      buttons: [
        desktopActionButton("resetWindowLayout", "model.resetWindowLayout", "model.resettingWindowLayout")
      ]
    },
    {
      id: "diagnostics",
      label: t("model.desktopGroupDiagnostics"),
      buttons: [
        desktopButton({
          key: "copyDiagnostics",
          labelKey: "model.copyDiagnostics",
          busyLabelKey: "model.copyingDiagnostics",
          isBusy: isCopyingDiagnostics,
          onClick: () => void handleCopyDiagnostics()
        }),
        desktopButton({
          key: "saveDiagnosticsReport",
          labelKey: "model.saveDiagnosticsReport",
          busyLabelKey: "model.savingDiagnosticsReport",
          isBusy: isSavingDiagnostics,
          onClick: () => void handleSaveDiagnosticsReport()
        })
      ]
    },
    {
      id: "folders",
      label: t("model.desktopGroupFolders"),
      buttons: [
        desktopActionButton("openAppFolder", "model.openAppFolder", "model.openingDesktopPath"),
        desktopActionButton("openDataFolder", "model.openDataFolder", "model.openingDesktopPath"),
        desktopActionButton("openSettingsFolder", "model.openSettingsFolder", "model.openingDesktopPath"),
        desktopActionButton("openDiagnosticsFolder", "model.openDiagnosticsFolder", "model.openingDesktopPath")
      ]
    },
    {
      id: "backups",
      label: t("model.desktopGroupBackups"),
      buttons: [
        desktopActionButton("createDataBackup", "model.createDataBackup", "model.creatingBackup"),
        desktopButton({
          key: "restoreLatestDataBackup",
          labelKey: "model.restoreLatestBackup",
          busyLabelKey: "model.restoringBackup",
          isBusy: desktopActionBusy === "restoreLatestDataBackup",
          disabled: desktopControlsBusy || !desktopBackupSummary?.latestName,
          onClick: () => void handleRestoreLatestBackup()
        }),
        desktopActionButton("openBackupsFolder", "model.openBackupsFolder", "model.openingDesktopPath"),
        desktopActionButton(
          "openLatestBackupFolder",
          "model.openLatestBackupFolder",
          "model.openingDesktopPath",
          desktopControlsBusy || !desktopBackupSummary?.latestName
        ),
        desktopButton({
          key: "pruneOldDataBackups",
          labelKey: "model.pruneOldBackups",
          busyLabelKey: "model.pruningBackups",
          isBusy: desktopActionBusy === "pruneOldDataBackups",
          disabled: desktopControlsBusy || (desktopBackupSummary?.count ?? 0) <= 5,
          onClick: () => void handlePruneOldBackups()
        })
      ]
    },
    ...(desktopBridge?.isPackaged ? [
      {
        id: "shortcuts",
        label: t("model.desktopGroupShortcuts"),
        buttons: [
          desktopActionButton("createAppShortcuts", "model.createAppShortcuts", "model.creatingShortcut"),
          desktopActionButton("createDesktopShortcut", "model.createDesktopShortcut", "model.creatingShortcut"),
          desktopActionButton("createStartMenuShortcut", "model.createStartMenuShortcut", "model.creatingShortcut")
        ]
      }
    ] : [])
  ];

  return (
    <section className="desktop-tools" aria-label={t("model.desktopToolsAria")}>
      <DesktopAppDetails
        desktopBackupSummary={desktopBackupSummary}
        desktopBridge={desktopBridge}
        desktopShortcutSummary={desktopShortcutSummary}
      />
      {desktopPreferences && (
        <DesktopPreferencesControls
          ariaLabel={t("model.desktopPreferencesAria")}
          controlsBusy={desktopControlsBusy}
          hideToTrayOnCloseLabel={t("model.hideToTrayOnClose")}
          launchAtSignInLabel={t("model.launchAtSignIn")}
          onPreferenceChange={handleDesktopPreferenceChange}
          preferenceBusy={desktopPreferenceBusy}
          preferences={desktopPreferences}
          savingDesktopPreferenceLabel={t("model.savingDesktopPreference")}
        />
      )}
      <DesktopActionGroups
        ariaLabel={t("model.desktopActionGroupsAria")}
        groups={desktopActionGroups}
      />
      {desktopActionNotice && (
        <p
          className={`result-notice ${desktopActionNotice.kind === "error" ? "error" : ""}`}
          role={desktopActionNotice.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {desktopActionNotice.message}
        </p>
      )}
      {pendingConfirm && (
        <ConfirmDialog
          message={pendingConfirm.message}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const action = pendingConfirm.action;
            setPendingConfirm(null);
            void handleDesktopAction(action);
          }}
        />
      )}
    </section>
  );
}
