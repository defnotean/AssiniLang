import { describe, expect, it } from "vitest";
import type { LlmStatus, ObservabilityData } from "../api";
import { buildDesktopDiagnosticsText, formatDesktopBackupTime } from "./desktopDiagnostics";

type DesktopDiagnosticsInput = Parameters<typeof buildDesktopDiagnosticsText>[0];

const status: LlmStatus = {
  activeProviderName: "Ollama",
  apiKey: {
    acceptedVariables: ["ASSINI_LLM_API_KEY"],
    configured: false,
    required: false
  },
  baseUrl: "http://127.0.0.1:11434/v1",
  configured: true,
  environment: {
    apiKeyVariables: ["ASSINI_LLM_API_KEY"],
    baseUrlVariable: "ASSINI_LLM_BASE_URL",
    modelVariable: "ASSINI_LLM_MODEL",
    providerVariable: "ASSINI_LLM_PROVIDER",
    timeoutVariable: "ASSINI_LLM_TIMEOUT_MS"
  },
  mode: "local-openai-compatible",
  model: "C:\\models\\irene\\fusion.gguf",
  provider: "openai-compatible",
  setup: {
    localExamples: [],
    remoteExamples: []
  },
  timeoutMs: 45000,
  transcription: {
    baseUrl: "",
    baseUrlVariable: "ASSINI_TRANSCRIBE_BASE_URL",
    configured: false,
    model: "",
    modelVariable: "ASSINI_TRANSCRIBE_MODEL"
  },
  ocr: {
    baseUrl: "",
    baseUrlVariable: "ASSINI_OCR_BASE_URL",
    configured: false,
    model: "",
    modelVariable: "ASSINI_OCR_MODEL"
  },
  warnings: ["one", "two"]
};

const observability: ObservabilityData = {
  sessions: [
    {
      contextNoteIds: [],
      contextPassageIds: [],
      createdAt: "2026-07-07T20:00:00.000Z",
      createdBy: "learner",
      id: "session-1",
      languageId: "lang-1",
      messageCount: 2,
      mode: "learner_practice",
      privacy: {
        exposesHiddenChainOfThought: false,
        redactions: []
      },
      status: "failed",
      thinkingSummary: "",
      updatedAt: "2026-07-07T20:01:00.000Z"
    },
    {
      contextNoteIds: [],
      contextPassageIds: [],
      createdAt: "2026-07-07T20:02:00.000Z",
      createdBy: "learner",
      id: "session-2",
      languageId: "lang-1",
      messageCount: 3,
      mode: "learner_practice",
      privacy: {
        exposesHiddenChainOfThought: false,
        redactions: []
      },
      status: "completed",
      thinkingSummary: "",
      updatedAt: "2026-07-07T20:03:00.000Z"
    }
  ],
  totals: {
    activeSessions: 0,
    elderCorrections: 0,
    messages: 5,
    sessions: 3
  }
};

function baseInput(): DesktopDiagnosticsInput {
  const discoveryEndpoints: DesktopDiagnosticsInput["discoveryEndpoints"] = [
    {
      baseUrl: "http://127.0.0.1:11434/v1",
      connected: true,
      modelCount: 1,
      provider: "ollama",
      providerLabel: "Ollama",
      source: "ollama-default"
    },
    {
      baseUrl: "http://127.0.0.1:1234/v1",
      connected: false,
      detail: "ECONNREFUSED",
      modelCount: 0,
      provider: "lm-studio",
      providerLabel: "LM Studio",
      source: "lmstudio-default",
      status: 503
    }
  ];

  return {
    connectedEndpointCount: 1,
    desktopBackupSummary: {
      count: 1,
      latestCreatedAt: "not-a-date",
      latestName: "backup-2026-07-07T20-00-00-000Z",
      latestPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups\\backup-2026-07-07T20-00-00-000Z"
    },
    desktopBridge: {
      appFolder: "C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang",
      appPath: "C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang\\AssiniLang.exe",
      appVersion: "0.1.0",
      backupsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups",
      dataDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data",
      diagnosticsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics",
      isPackaged: true,
      settingsPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env"
    },
    desktopPreferences: {
      hideToTray: false,
      hideToTraySupported: false,
      launchAtLogin: true,
      launchAtLoginSupported: true
    },
    desktopShortcutSummary: {
      desktopExists: false,
      desktopPath: "C:\\Users\\Demon\\Desktop\\AssiniLang.lnk",
      startMenuExists: true,
      startMenuPath: "C:\\Users\\Demon\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\AssiniLang.lnk"
    },
    discoveryEndpoints,
    discoveryErrorCount: 1,
    discoveredModels: [
      {
        baseUrl: "http://127.0.0.1:11434/v1",
        id: "ollama:llama3.1",
        model: "llama3.1",
        provider: "ollama",
        providerLabel: "Ollama",
        requiresApiKey: false,
        source: "ollama-default"
      }
    ],
    failedEndpointCount: 1,
    generatedAt: "2026-07-07T20:30:00.000Z",
    lastModelScan: "2026-07-07T20:10:00.000Z",
    modelDiscoveryState: {
      data: {
        endpoints: discoveryEndpoints,
        errors: [
          {
            baseUrl: "http://127.0.0.1:1234/v1",
            detail: "ECONNREFUSED",
            source: "lmstudio-default"
          }
        ],
        models: [],
        scannedAt: "2026-07-07T20:10:00.000Z"
      },
      status: "ready"
    },
    observabilityState: {
      data: observability,
      status: "ready"
    },
    settings: {
      allowPrivateUrls: false,
      apiKeyConfigured: false,
      baseUrl: "http://127.0.0.1:11434/v1",
      jsonMode: true,
      maxTokens: 4096,
      model: "llama3.1",
      ocrLang: "eng",
      ocrBaseUrl: "http://127.0.0.1:11434/v1",
      ocrModel: "llava",
      ocrApiKeyConfigured: false,
      provider: "openai-compatible",
      timeoutMs: 45000,
      transcriptionApiKeyConfigured: true,
      transcriptionBaseUrl: "",
      transcriptionModel: "whisper-large"
    },
    status
  };
}

describe("desktopDiagnostics", () => {
  it("builds desktop diagnostics text in the existing order and wording", () => {
    expect(buildDesktopDiagnosticsText(baseInput())).toBe([
      "AssiniLang Desktop diagnostics",
      "Generated: 2026-07-07T20:30:00.000Z",
      "",
      "Desktop",
      "- Bridge: available",
      "- Packaged: yes",
      "- App version: 0.1.0",
      "- App executable: C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang\\AssiniLang.exe",
      "- App folder: C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang",
      "- Data folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data",
      "- Settings file: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env",
      "- Backups folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups",
      "- Diagnostics folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics",
      "- Backups available: 1",
      "- Latest backup: backup-2026-07-07T20-00-00-000Z",
      "- Latest backup created: not-a-date",
      "- Desktop shortcut: not installed",
      "- Desktop shortcut path: C:\\Users\\Demon\\Desktop\\AssiniLang.lnk",
      "- Start Menu shortcut: installed",
      "- Start Menu shortcut path: C:\\Users\\Demon\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\AssiniLang.lnk",
      "- Launch at sign-in: yes",
      "- Launch at sign-in supported: yes",
      "- Hide to tray on close: no",
      "- Hide to tray supported: no",
      "",
      "Provider readiness",
      "- Ready: yes",
      "- Mode: local openai compatible",
      "- Provider: openai-compatible",
      "- Active provider: Ollama",
      "- Model: C:\\models\\irene\\fusion.gguf",
      "- Model display: fusion.gguf",
      "- Base URL: http://127.0.0.1:11434/v1",
      "- Timeout ms: 45000",
      "- API key: optional/not configured",
      "- Warnings: 2",
      "",
      "Runtime settings",
      "- Loaded: yes",
      "- Provider: openai-compatible",
      "- Base URL: http://127.0.0.1:11434/v1",
      "- Model: llama3.1",
      "- Max tokens: 4096",
      "- JSON mode: yes",
      "- Allow private URLs: no",
      "- Transcription base URL: not set",
      "- Transcription model: whisper-large",
      "- Transcription key: configured server-side",
      "- OCR base URL: http://127.0.0.1:11434/v1",
      "- OCR model: llava",
      "- OCR key: not configured",
      "- OCR language: eng",
      "",
      "Model discovery",
      "- State: ready",
      "- Last scan: 2026-07-07T20:10:00.000Z",
      "- Models: 1",
      "- Connected endpoints: 1",
      "- Failed endpoints: 1",
      "- Discovery errors: 1",
      "",
      "Observability",
      "- State: ready",
      "- Total sessions: 3",
      "- Failed recent sessions: 1",
      "",
      "Loaded models",
      "- llama3.1 (Ollama, http://127.0.0.1:11434/v1)",
      "",
      "Discovery endpoints",
      "- connected http://127.0.0.1:11434/v1 (Ollama; models: 1)",
      "- failed http://127.0.0.1:1234/v1 (LM Studio; models: 0; status: 503; detail: ECONNREFUSED)"
    ].join("\n"));
  });

  it("caps loaded model details at 25 entries", () => {
    const input = baseInput();
    input.discoveredModels = Array.from({ length: 27 }, (_, index) => ({
      baseUrl: "http://127.0.0.1:11434/v1",
      id: `ollama:model-${index}`,
      model: `model-${index}`,
      provider: "ollama",
      providerLabel: "Ollama",
      requiresApiKey: false,
      source: "ollama-default"
    }));

    const diagnostics = buildDesktopDiagnosticsText(input);

    expect(diagnostics).toContain("- model-24 (Ollama, http://127.0.0.1:11434/v1)");
    expect(diagnostics).not.toContain("- model-25 (Ollama, http://127.0.0.1:11434/v1)");
    expect(diagnostics).toContain("- 2 more models omitted");
  });

  it("keeps invalid backup times unchanged", () => {
    expect(formatDesktopBackupTime("not-a-date")).toBe("not-a-date");
  });
});
