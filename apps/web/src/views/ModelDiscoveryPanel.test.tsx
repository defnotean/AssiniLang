import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveredLlmModel, LlmModelDiscoveryResponse } from "../api";
import { ModelDiscoveryPanel } from "./ModelDiscoveryPanel";

const emptyDiscovery: LlmModelDiscoveryResponse = {
  scannedAt: "2026-07-09T00:00:00.000Z",
  models: [],
  endpoints: [],
  errors: []
};

function panelProps(overrides: Partial<Parameters<typeof ModelDiscoveryPanel>[0]> = {}) {
  return {
    connectedEndpoints: [],
    discoveryErrors: [],
    discoveredModels: [],
    failedEndpoints: [],
    formBaseUrl: "",
    isAutoRefreshingModels: false,
    isSavingSettings: false,
    isScanningModels: false,
    lastModelScan: null,
    modelDiscoveryState: { status: "ready", data: emptyDiscovery } as const,
    onApplyLoadedModel: vi.fn(),
    onClearSavedModel: vi.fn(),
    onDiscoveredModelChange: vi.fn(),
    onRefreshModelDiscovery: vi.fn(),
    selectedDiscoveredModelId: "",
    staleActiveModel: null,
    ...overrides
  } satisfies Parameters<typeof ModelDiscoveryPanel>[0];
}

function renderPanel(overrides: Partial<Parameters<typeof ModelDiscoveryPanel>[0]> = {}) {
  const props = panelProps(overrides);
  const rendered = render(<ModelDiscoveryPanel {...props} />);
  return {
    ...rendered,
    rerenderPanel(nextOverrides: Partial<Parameters<typeof ModelDiscoveryPanel>[0]> = {}) {
      rendered.rerender(<ModelDiscoveryPanel {...props} {...nextOverrides} />);
    }
  };
}

describe("ModelDiscoveryPanel connection errors", () => {
  it("announces failed endpoint errors as alerts and prefers them over discovery errors", () => {
    renderPanel({
      failedEndpoints: [
        {
          source: "ollama",
          baseUrl: "http://127.0.0.1:11434",
          provider: "ollama",
          providerLabel: "Ollama",
          connected: false,
          modelCount: 0,
          detail: "Connection refused"
        }
      ],
      discoveryErrors: [
        {
          source: "lmstudio",
          baseUrl: "http://127.0.0.1:1234",
          detail: "Timed out"
        }
      ]
    });

    const failedAlert = screen.getByRole("alert");
    expect(failedAlert).toHaveTextContent("http://127.0.0.1:11434");
    expect(screen.queryByText(/http:\/\/127\.0\.0\.1:1234/)).not.toBeInTheDocument();
  });

  it("announces discovery errors when no endpoints connected or failed", () => {
    renderPanel({
      discoveryErrors: [
        {
          source: "lmstudio",
          baseUrl: "http://127.0.0.1:1234",
          detail: "Timed out"
        }
      ]
    });

    expect(screen.getByRole("alert")).toHaveTextContent("http://127.0.0.1:1234");
  });

  it("does not re-announce unchanged endpoint failures from polling", () => {
    const failedEndpoint = {
      source: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      provider: "ollama" as const,
      providerLabel: "Ollama",
      connected: false,
      modelCount: 0,
      detail: "Connection refused"
    };
    const { rerenderPanel } = renderPanel({ failedEndpoints: [failedEndpoint] });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("http://127.0.0.1:11434");
    const observer = new MutationObserver(() => undefined);
    observer.observe(alert, { attributes: true, childList: true, characterData: true, subtree: true });

    rerenderPanel({ failedEndpoints: [{ ...failedEndpoint }], isAutoRefreshingModels: true });

    expect(screen.getByRole("alert")).toBe(alert);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it("keeps routine automatic scan progress out of live regions", () => {
    renderPanel({ isAutoRefreshingModels: true });

    expect(screen.getByText("Checking for loaded or unloaded models...")).not.toHaveAttribute("role");
    expect(screen.getByText("Checking for loaded or unloaded models...")).not.toHaveAttribute("aria-live");
  });
});

describe("ModelDiscoveryPanel empty state", () => {
  it("shows a next-step hint when discovery finished with no models", () => {
    renderPanel();

    expect(screen.getByText("No models found yet")).toBeInTheDocument();
    const emptyHint = screen.getByText(
      "Start Ollama, LM Studio, or llama.cpp, then press Refresh models. Or enter a base URL above and scan again."
    );
    expect(emptyHint).toHaveAttribute("role", "status");
    expect(emptyHint).toHaveAttribute("aria-live", "polite");
  });

  it("hides the empty-state hint while a scan is in flight", () => {
    renderPanel({ isScanningModels: true });

    expect(
      screen.queryByText(
        "Start Ollama, LM Studio, or llama.cpp, then press Refresh models. Or enter a base URL above and scan again."
      )
    ).not.toBeInTheDocument();
  });

  it("shows a next-step hint when discovery itself fails", () => {
    renderPanel({
      modelDiscoveryState: { status: "error", message: "Model discovery failed" }
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("Model discovery failed");
    expect(alert).toHaveTextContent(/Confirm the provider is running/i);
    expect(alert).toHaveTextContent(/Refresh models/i);
  });
});

describe("ModelDiscoveryPanel unloaded-model stale state", () => {
  const replacement: DiscoveredLlmModel = {
    id: "lm-studio|http://127.0.0.1:1234/v1|newly-loaded-model",
    provider: "lm-studio",
    providerLabel: "LM Studio",
    source: "LM Studio local",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "newly-loaded-model",
    requiresApiKey: false
  };

  it("announces when a saved model is no longer present in discovery", () => {
    const onClearSavedModel = vi.fn();
    renderPanel({
      onClearSavedModel,
      staleActiveModel: {
        baseUrl: "http://127.0.0.1:1234/v1",
        replacement: null,
        savedModel: "unloaded-model",
        savedModelDisplay: "unloaded-model"
      }
    });

    const notice = screen.getByText(
      "Saved model unloaded-model is no longer loaded at http://127.0.0.1:1234/v1. Choose another discovered model or switch back to offline mode."
    );
    expect(notice.closest(".stale-model-notice")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Apply loaded model" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use offline mode" }));
    expect(onClearSavedModel).toHaveBeenCalledTimes(1);
  });

  it("offers applying the single replacement when discovery lists one loaded model", () => {
    const onApplyLoadedModel = vi.fn();
    renderPanel({
      discoveredModels: [replacement],
      onApplyLoadedModel,
      staleActiveModel: {
        baseUrl: "http://127.0.0.1:1234/v1",
        replacement,
        savedModel: "unloaded-model",
        savedModelDisplay: "unloaded-model"
      }
    });

    expect(
      screen.getByText(
        "Saved model unloaded-model is no longer loaded at http://127.0.0.1:1234/v1. The form now shows newly-loaded-model; apply it to switch immediately."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply loaded model" }));
    expect(onApplyLoadedModel).toHaveBeenCalledWith(replacement);
  });
});
