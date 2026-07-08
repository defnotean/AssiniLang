import type {
  DiscoveredLlmModel,
  LlmModelDiscoveryResponse,
  LlmStatus,
  ObservabilityData,
  RuntimeSettingsResponse
} from "../api";
import { countFailedSessions, formatMode } from "./format";
import { modelDisplayName } from "./modelFormatting";
import type { AsyncState } from "./types";
import type {
  DesktopBackupSummary,
  DesktopBridgeInfo,
  DesktopPreferences,
  DesktopShortcutSummary
} from "./desktopBridge";

type DesktopDiagnosticsInput = {
  connectedEndpointCount: number;
  desktopBackupSummary: DesktopBackupSummary | null;
  desktopBridge: DesktopBridgeInfo | null;
  desktopPreferences: DesktopPreferences | null;
  desktopShortcutSummary: DesktopShortcutSummary | null;
  discoveryEndpoints: LlmModelDiscoveryResponse["endpoints"];
  discoveryErrorCount: number;
  discoveredModels: DiscoveredLlmModel[];
  failedEndpointCount: number;
  generatedAt: string;
  lastModelScan: string | null;
  modelDiscoveryState: AsyncState<LlmModelDiscoveryResponse>;
  observabilityState: AsyncState<ObservabilityData>;
  settings: RuntimeSettingsResponse["settings"] | null;
  status: LlmStatus;
};

function diagnosticValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "not set";
}

function diagnosticYesNo(value: boolean | undefined): string {
  return value ? "yes" : "no";
}

function diagnosticApiKey(status: LlmStatus): string {
  if (status.apiKey.configured) return "configured server-side";
  return status.apiKey.required ? "required but not configured" : "optional/not configured";
}

export function formatDesktopBackupTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function buildDesktopDiagnosticsText({
  connectedEndpointCount,
  desktopBackupSummary,
  desktopBridge,
  desktopPreferences,
  desktopShortcutSummary,
  discoveryEndpoints,
  discoveryErrorCount,
  discoveredModels,
  failedEndpointCount,
  generatedAt,
  lastModelScan,
  modelDiscoveryState,
  observabilityState,
  settings,
  status
}: DesktopDiagnosticsInput): string {
  const observability = observabilityState.status === "ready" ? observabilityState.data : null;
  const lines = [
    "AssiniLang Desktop diagnostics",
    `Generated: ${generatedAt}`,
    "",
    "Desktop",
    `- Bridge: ${desktopBridge ? "available" : "not available"}`,
    `- Packaged: ${diagnosticYesNo(desktopBridge?.isPackaged)}`,
    `- App version: ${diagnosticValue(desktopBridge?.appVersion)}`,
    `- App executable: ${diagnosticValue(desktopBridge?.appPath)}`,
    `- App folder: ${diagnosticValue(desktopBridge?.appFolder)}`,
    `- Data folder: ${diagnosticValue(desktopBridge?.dataDir)}`,
    `- Settings file: ${diagnosticValue(desktopBridge?.settingsPath)}`,
    `- Backups folder: ${diagnosticValue(desktopBridge?.backupsDir)}`,
    `- Diagnostics folder: ${diagnosticValue(desktopBridge?.diagnosticsDir)}`,
    `- Backups available: ${desktopBackupSummary?.count ?? "not loaded"}`,
    `- Latest backup: ${diagnosticValue(desktopBackupSummary?.latestName)}`,
    `- Latest backup created: ${diagnosticValue(formatDesktopBackupTime(desktopBackupSummary?.latestCreatedAt))}`,
    `- Desktop shortcut: ${desktopShortcutSummary?.desktopExists ? "installed" : "not installed"}`,
    `- Desktop shortcut path: ${diagnosticValue(desktopShortcutSummary?.desktopPath)}`,
    `- Start Menu shortcut: ${desktopShortcutSummary?.startMenuExists ? "installed" : "not installed"}`,
    `- Start Menu shortcut path: ${diagnosticValue(desktopShortcutSummary?.startMenuPath)}`,
    `- Launch at sign-in: ${diagnosticYesNo(desktopPreferences?.launchAtLogin)}`,
    `- Launch at sign-in supported: ${diagnosticYesNo(desktopPreferences?.launchAtLoginSupported)}`,
    `- Hide to tray on close: ${diagnosticYesNo(desktopPreferences?.hideToTray)}`,
    `- Hide to tray supported: ${diagnosticYesNo(desktopPreferences?.hideToTraySupported)}`,
    "",
    "Provider readiness",
    `- Ready: ${diagnosticYesNo(status.configured)}`,
    `- Mode: ${formatMode(status.mode)}`,
    `- Provider: ${diagnosticValue(status.provider)}`,
    `- Active provider: ${diagnosticValue(status.activeProviderName)}`,
    `- Model: ${diagnosticValue(status.model)}`,
    `- Model display: ${status.model ? modelDisplayName(status.model) : "not set"}`,
    `- Base URL: ${diagnosticValue(status.baseUrl)}`,
    `- Timeout ms: ${status.timeoutMs}`,
    `- API key: ${diagnosticApiKey(status)}`,
    `- Warnings: ${status.warnings.length}`,
    "",
    "Runtime settings",
    `- Loaded: ${settings ? "yes" : "no"}`,
    `- Provider: ${diagnosticValue(settings?.provider)}`,
    `- Base URL: ${diagnosticValue(settings?.baseUrl)}`,
    `- Model: ${diagnosticValue(settings?.model)}`,
    `- Max tokens: ${settings?.maxTokens ?? "not set"}`,
    `- JSON mode: ${diagnosticYesNo(settings?.jsonMode)}`,
    `- Allow private URLs: ${diagnosticYesNo(settings?.allowPrivateUrls)}`,
    `- Transcription base URL: ${diagnosticValue(settings?.transcriptionBaseUrl)}`,
    `- Transcription model: ${diagnosticValue(settings?.transcriptionModel)}`,
    `- Transcription key: ${settings?.transcriptionApiKeyConfigured ? "configured server-side" : "not configured"}`,
    `- OCR language: ${diagnosticValue(settings?.ocrLang)}`,
    "",
    "Model discovery",
    `- State: ${modelDiscoveryState.status}`,
    `- Last scan: ${lastModelScan ?? "not scanned"}`,
    `- Models: ${discoveredModels.length}`,
    `- Connected endpoints: ${connectedEndpointCount}`,
    `- Failed endpoints: ${failedEndpointCount}`,
    `- Discovery errors: ${discoveryErrorCount}`,
    "",
    "Observability",
    `- State: ${observabilityState.status}`,
    `- Total sessions: ${observability?.totals.sessions ?? "not loaded"}`,
    `- Failed recent sessions: ${observability ? countFailedSessions(observability) : "not loaded"}`
  ];

  if (discoveredModels.length > 0) {
    lines.push("", "Loaded models");
    discoveredModels.slice(0, 25).forEach((candidate) => {
      lines.push(`- ${candidate.model} (${candidate.providerLabel}, ${candidate.baseUrl})`);
    });
    if (discoveredModels.length > 25) {
      lines.push(`- ${discoveredModels.length - 25} more models omitted`);
    }
  }

  if (discoveryEndpoints.length > 0) {
    lines.push("", "Discovery endpoints");
    discoveryEndpoints.forEach((endpoint) => {
      const detail = endpoint.detail ? `; detail: ${endpoint.detail}` : "";
      const statusCode = endpoint.status ? `; status: ${endpoint.status}` : "";
      lines.push(
        `- ${endpoint.connected ? "connected" : "failed"} ${endpoint.baseUrl} (${endpoint.providerLabel}; models: ${endpoint.modelCount}${statusCode}${detail})`
      );
    });
  }

  return lines.join("\n");
}
