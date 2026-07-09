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

describe("ModelDiscoveryPanel empty state", () => {
  it("shows a next-step hint when discovery finished with no models", () => {
    renderPanel();

    expect(screen.getByText("No models found yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Start Ollama, LM Studio, or llama.cpp, then press Refresh models. Or enter a base URL above and scan again."
      )
    ).toBeInTheDocument();
  });

  it("hides the empty-state hint while a scan is in flight", () => {
    renderPanel({ isScanningModels: true });

    expect(
      screen.queryByText(
        "Start Ollama, LM Studio, or llama.cpp, then press Refresh models. Or enter a base URL above and scan again."
      )
    ).not.toBeInTheDocument();
  });
});
