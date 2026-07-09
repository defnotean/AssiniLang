import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LlmModelDiscoveryResponse } from "../api";
import { ModelDiscoveryPanel } from "./ModelDiscoveryPanel";

const emptyDiscovery: LlmModelDiscoveryResponse = {
  scannedAt: "2026-07-09T00:00:00.000Z",
  models: [],
  endpoints: [],
  errors: []
};

function renderPanel(overrides: Partial<Parameters<typeof ModelDiscoveryPanel>[0]> = {}) {
  return render(
    <ModelDiscoveryPanel
      connectedEndpoints={[]}
      discoveryErrors={[]}
      discoveredModels={[]}
      failedEndpoints={[]}
      formBaseUrl=""
      isAutoRefreshingModels={false}
      isSavingSettings={false}
      isScanningModels={false}
      lastModelScan={null}
      modelDiscoveryState={{ status: "ready", data: emptyDiscovery }}
      onApplyLoadedModel={vi.fn()}
      onClearSavedModel={vi.fn()}
      onDiscoveredModelChange={vi.fn()}
      onRefreshModelDiscovery={vi.fn()}
      selectedDiscoveredModelId=""
      staleActiveModel={null}
      {...overrides}
    />
  );
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

    const failedAlert = screen.getByText(/http:\/\/127\.0\.0\.1:11434/);
    expect(failedAlert).toHaveAttribute("role", "alert");
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

    expect(screen.getByText(/http:\/\/127\.0\.0\.1:1234/)).toHaveAttribute("role", "alert");
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
