import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
          embeddingBaseUrl: "",
          embeddingModel: "",
          embeddingApiKeyConfigured: false,
          embeddingTimeoutMs: 30000,
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

  it("announces settings save failures with assertive aria-live", () => {
    render(
      <ModelSetupView
        model={createModelWorkspace({
          settingsSaveResult: null,
          settingsSaveError: "Could not save settings."
        })}
      />
    );

    const saveError = screen.getByText("Could not save settings.");
    expect(saveError).toHaveAttribute("role", "alert");
    expect(saveError).toHaveAttribute("aria-live", "assertive");
  });

  it("submits dedicated embedding settings without reusing chat fields", async () => {
    const handleSaveSettings = vi.fn().mockResolvedValue(undefined);
    render(
      <ModelSetupView
        model={createModelWorkspace({
          handleSaveSettings,
          settingsSaveResult: null
        })}
      />
    );

    fireEvent.change(screen.getByLabelText("Embedding base URL"), {
      target: { value: "http://127.0.0.1:8080/v1" }
    });
    fireEvent.change(screen.getByLabelText("Embedding model"), {
      target: { value: "nomic-embed-text" }
    });
    fireEvent.change(screen.getByLabelText("Replace embedding key"), {
      target: { value: "embedding-secret" }
    });
    fireEvent.change(screen.getByLabelText("Embedding timeout"), {
      target: { value: "15000" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(handleSaveSettings).toHaveBeenCalledWith(expect.objectContaining({
      embeddingBaseUrl: "http://127.0.0.1:8080/v1",
      embeddingModel: "nomic-embed-text",
      embeddingApiKey: "embedding-secret",
      embeddingTimeoutMs: 15000
    })));
  });

  it("shows a next-step hint when no model profiles are saved yet", () => {
    render(<ModelSetupView model={createModelWorkspace({ settingsSaveResult: null })} />);

    const emptyHint = screen.getByText(/Enter a profile name below, then Save profile/i);
    expect(emptyHint).toHaveAttribute("role", "status");
    expect(emptyHint).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("option", { name: "No saved profiles" })).toBeInTheDocument();
  });

  it("activates a named saved profile from the profile select", async () => {
    const handleActivateModelProfile = vi.fn().mockResolvedValue(undefined);
    const status = createLlmStatus();
    const profiles = [
      {
        id: "irene-local",
        name: "Irene local",
        provider: "openai-compatible" as const,
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "irene-fusion",
        apiKeyConfigured: false,
        timeoutMs: 180000,
        maxTokens: 4096,
        jsonMode: false,
        embeddingBaseUrl: "",
        embeddingModel: "",
        embeddingApiKeyConfigured: false,
        embeddingTimeoutMs: 30000,
        transcriptionBaseUrl: "",
        transcriptionModel: "whisper-1",
        transcriptionApiKeyConfigured: false,
        ocrBaseUrl: "",
        ocrModel: "llava",
        ocrApiKeyConfigured: false,
        ocrLang: "eng",
        allowPrivateUrls: false,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z"
      },
      {
        id: "studio-small",
        name: "Studio small",
        provider: "lm-studio" as const,
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "irene-small",
        apiKeyConfigured: false,
        timeoutMs: 90000,
        maxTokens: 4096,
        jsonMode: false,
        embeddingBaseUrl: "",
        embeddingModel: "",
        embeddingApiKeyConfigured: false,
        embeddingTimeoutMs: 30000,
        transcriptionBaseUrl: "",
        transcriptionModel: "whisper-1",
        transcriptionApiKeyConfigured: false,
        ocrBaseUrl: "",
        ocrModel: "llava",
        ocrApiKeyConfigured: false,
        ocrLang: "eng",
        allowPrivateUrls: false,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z"
      }
    ];

    render(
      <ModelSetupView
        model={createModelWorkspace({
          settingsSaveResult: null,
          handleActivateModelProfile,
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
                embeddingBaseUrl: "",
                embeddingModel: "",
                embeddingApiKeyConfigured: false,
                embeddingTimeoutMs: 30000,
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
              profiles,
              activeProfileId: "irene-local"
            }
          }
        })}
      />
    );

    const profileSelect = screen.getByLabelText("Saved profiles");
    expect(profileSelect).toHaveValue("irene-local");
    expect(screen.getByRole("option", { name: "Irene local (irene-fusion)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Studio small (irene-small)" })).toBeInTheDocument();

    fireEvent.change(profileSelect, { target: { value: "studio-small" } });

    await waitFor(() => expect(handleActivateModelProfile).toHaveBeenCalledWith("studio-small"));
  });

  it("renders localized provider option labels in the settings select", () => {
    render(<ModelSetupView model={createModelWorkspace({ settingsSaveResult: null })} />);

    expect(screen.getByRole("option", { name: "OpenAI-compatible" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Deterministic" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Remote OpenAI" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "LM Studio" })).toBeInTheDocument();
  });

  it("shows a next-step hint when LLM status fails to load", () => {
    const reload = vi.fn();
    render(
      <ModelSetupView
        model={createModelWorkspace({
          llmState: { status: "error", message: "Runtime settings could not be loaded" },
          settingsSaveResult: null,
          reloadModelWorkspace: reload
        })}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Runtime settings could not be loaded");
    expect(
      screen.getByText(/Check that the local API is running, then retry/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows next-step empty states when setup examples are missing", () => {
    const workspace = createModelWorkspace({ settingsSaveResult: null });
    const status = workspace.llmState.status === "ready" ? workspace.llmState.data : null;
    if (!status) throw new Error("expected ready llm status");

    render(
      <ModelSetupView
        model={createModelWorkspace({
          settingsSaveResult: null,
          llmState: {
            status: "ready",
            data: {
              ...status,
              setup: { localExamples: [], remoteExamples: [] }
            }
          }
        })}
      />
    );

    const localEmpty = screen.getByText(/No local setup examples were returned/i);
    expect(localEmpty).toHaveAttribute("role", "status");
    expect(localEmpty).toHaveAttribute("aria-live", "polite");
    expect(localEmpty).toHaveClass("empty-state");

    const remoteEmpty = screen.getByText(/No remote setup examples were returned/i);
    expect(remoteEmpty).toHaveAttribute("role", "status");
    expect(remoteEmpty).toHaveAttribute("aria-live", "polite");
    expect(remoteEmpty).toHaveClass("empty-state");
  });
});
