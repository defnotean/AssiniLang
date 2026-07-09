import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LlmStatus } from "../api";
import { ProviderReadinessPanel } from "./ProviderReadinessPanel";

const status: LlmStatus = {
  provider: "ollama",
  mode: "local-openai-compatible",
  configured: true,
  activeProviderName: "ollama",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "llama3.2",
  timeoutMs: 30_000,
  apiKey: {
    required: false,
    configured: false,
    acceptedVariables: ["ASSINI_LLM_API_KEY"]
  },
  environment: {
    providerVariable: "ASSINI_LLM_PROVIDER",
    baseUrlVariable: "ASSINI_LLM_BASE_URL",
    modelVariable: "ASSINI_LLM_MODEL",
    apiKeyVariables: ["ASSINI_LLM_API_KEY"],
    timeoutVariable: "ASSINI_LLM_TIMEOUT_MS"
  },
  transcription: {
    configured: false,
    baseUrlVariable: "ASSINI_TRANSCRIBE_BASE_URL",
    modelVariable: "ASSINI_TRANSCRIBE_MODEL"
  },
  ocr: {
    configured: false,
    baseUrlVariable: "ASSINI_OCR_BASE_URL",
    modelVariable: "ASSINI_OCR_MODEL"
  },
  setup: {
    localExamples: [],
    remoteExamples: []
  },
  warnings: []
};

function renderPanel(overrides: Partial<Parameters<typeof ProviderReadinessPanel>[0]> = {}) {
  return render(
    <ProviderReadinessPanel
      isCheckingReachability={false}
      isSavingSettings={false}
      isTestingModel={false}
      modelTestIsPlaceholder={false}
      modelTestResult={null}
      onSmokeTest={vi.fn()}
      onTestConnection={vi.fn()}
      reachabilityError={null}
      reachabilityResult={null}
      status={status}
      {...overrides}
    />
  );
}

describe("ProviderReadinessPanel", () => {
  it("localizes the provider mode label", () => {
    renderPanel();
    expect(screen.getByText("local openai compatible")).toBeInTheDocument();
  });

  it("localizes the provider name and status warnings", () => {
    renderPanel({
      status: {
        ...status,
        provider: "openai-compatible",
        warnings: [
          "No LLM provider configured; using deterministic fallback for safe local development.",
          "ASSINI_LLM_TIMEOUT_MS must be a positive integer; using 180000."
        ]
      }
    });

    expect(screen.getByText("OpenAI-compatible")).toBeInTheDocument();
    expect(
      screen.getByText("No LLM provider configured; using deterministic fallback for safe local development.")
    ).toBeInTheDocument();
    expect(screen.getByText("ASSINI_LLM_TIMEOUT_MS must be a positive integer; using 180000.")).toBeInTheDocument();
  });

  it("shows next-step guidance when the provider still needs configuration", () => {
    renderPanel({
      status: {
        ...status,
        configured: false,
        baseUrl: undefined,
        model: ""
      }
    });

    const hint = screen.getByRole("status");
    expect(hint).toHaveAttribute("aria-live", "polite");
    expect(hint).toHaveTextContent(/Choose a discovered model below/i);
    expect(hint).toHaveTextContent(/Save settings/i);
    expect(screen.getByText("Needs configuration")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  it("hides the configuration hint once the provider is ready", () => {
    renderPanel();

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText(/Choose a discovered model below/i)).not.toBeInTheDocument();
  });

  it("announces reachability failures with assertive aria-live", () => {
    renderPanel({ reachabilityError: "LLM reachability check failed" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("LLM reachability check failed");
  });

  it("marks smoke-test and connection-test actions busy while in flight", () => {
    const { rerender } = renderPanel({ isTestingModel: true });
    const smokeButton = screen.getByRole("button", { name: "Testing provider..." });
    expect(smokeButton).toBeDisabled();
    expect(smokeButton).toHaveAttribute("aria-busy", "true");

    rerender(
      <ProviderReadinessPanel
        isCheckingReachability={true}
        isSavingSettings={false}
        isTestingModel={false}
        modelTestIsPlaceholder={false}
        modelTestResult={null}
        onSmokeTest={vi.fn()}
        onTestConnection={vi.fn()}
        reachabilityError={null}
        reachabilityResult={null}
        status={status}
      />
    );

    const connectionButton = screen.getByRole("button", { name: "Testing…" });
    expect(connectionButton).toBeDisabled();
    expect(connectionButton).toHaveAttribute("aria-busy", "true");
  });
});
