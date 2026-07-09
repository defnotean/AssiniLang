import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ModelWorkspace } from "../hooks/useModelWorkspace";
import { ModelSetupView } from "./ModelSetupView";

function createLlmStatus() {
  return {
    provider: "openai-compatible",
    mode: "local-openai-compatible" as const,
    configured: true,
    activeProviderName: "local-openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1",
    timeoutMs: 180000,
    apiKey: { required: false, configured: false, acceptedVariables: ["ASSINI_LLM_API_KEY"] },
    environment: {
      providerVariable: "ASSINI_LLM_PROVIDER",
      baseUrlVariable: "ASSINI_LLM_BASE_URL",
      modelVariable: "ASSINI_LLM_MODEL",
      apiKeyVariables: ["ASSINI_LLM_API_KEY"],
      timeoutVariable: "ASSINI_LLM_TIMEOUT_MS"
    },
    setup: {
      localExamples: ["ASSINI_LLM_PROVIDER=openai-compatible"],
      remoteExamples: ["ASSINI_LLM_PROVIDER=openai"]
    },
    transcription: {
      configured: false,
      baseUrl: undefined as string | undefined,
      model: undefined as string | undefined,
      baseUrlVariable: "ASSINI_TRANSCRIBE_BASE_URL",
      modelVariable: "ASSINI_TRANSCRIBE_MODEL"
    },
    ocr: {
      configured: false,
      baseUrl: undefined as string | undefined,
      model: undefined as string | undefined,
      baseUrlVariable: "ASSINI_OCR_BASE_URL",
      modelVariable: "ASSINI_OCR_MODEL"
    },
    warnings: [] as string[]
  };
}

function createModelWorkspace(overrides: Partial<ModelWorkspace> = {}): ModelWorkspace {
  const status = createLlmStatus();
  return {
    llmState: { status: "ready", data: status },
    settingsState: {
      status: "ready",
      data: {
        settings: {
          provider: status.provider,
          baseUrl: status.baseUrl ?? "",
          model: status.model ?? "",
          apiKeyConfigured: false,
          timeoutMs: status.timeoutMs,
          maxTokens: 4096,
          jsonMode: false,
          transcriptionBaseUrl: "",
          transcriptionModel: "whisper-1",
          transcriptionApiKeyConfigured: false,
          ocrBaseUrl: "",
          ocrModel: "llava",
          ocrApiKeyConfigured: false,
          ocrLang: "eng",
          allowPrivateUrls: false
        },
        status,
        persisted: true,
        profiles: []
      }
    },
    modelDiscoveryState: {
      status: "ready",
      data: { scannedAt: "2026-07-06T00:00:00.000Z", models: [], endpoints: [], errors: [] }
    },
    observabilityState: {
      status: "ready",
      data: {
        totals: {
          sessions: 0,
          activeSessions: 0,
          messages: 0,
          elderCorrections: 0
        },
        sessions: []
      }
    },
    isTestingModel: false,
    modelTestResult: null,
    modelTestIsPlaceholder: false,
    isCheckingReachability: false,
    reachabilityResult: null,
    reachabilityError: null,
    isSavingSettings: false,
    settingsSaveResult: "Settings saved and applied.",
    settingsSaveError: null,
    isRefreshingModels: false,
    isAutoRefreshingModels: false,
    refreshModelObservability: vi.fn(),
    refreshModelDiscovery: vi.fn(),
    handleSaveSettings: vi.fn(),
    handleSaveModelProfile: vi.fn(),
    handleActivateModelProfile: vi.fn(),
    handleDeleteModelProfile: vi.fn(),
    handleModelSmokeTest: vi.fn(),
    handleTestConnection: vi.fn(),
    reloadModelWorkspace: vi.fn(),
    ...overrides
  };
}

describe("ModelSetupView settings save status", () => {
  it("announces settings save success with aria-live polite messaging", () => {
    render(<ModelSetupView model={createModelWorkspace()} />);

    const saveStatus = screen.getByText("Settings saved and applied.").closest("[aria-live]");
    expect(saveStatus).toHaveAttribute("aria-live", "polite");
    expect(saveStatus).toHaveAttribute("role", "status");
  });

  it("disables save and marks the button busy while settings are saving", () => {
    render(<ModelSetupView model={createModelWorkspace({ isSavingSettings: true, settingsSaveResult: null })} />);

    const saveButton = screen.getByRole("button", { name: "Saving settings..." });
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAttribute("aria-busy", "true");
  });
});
