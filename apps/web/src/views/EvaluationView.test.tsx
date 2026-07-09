import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EvaluationRun } from "../evaluationTrends";
import type { Language } from "../lib/types";
import { EvaluationView } from "./EvaluationView";

const languages: Language[] = [
  {
    id: "avenik",
    name: "Avenik",
    description: "Test language",
    typology: "agglutinative",
    orthography: "Latin",
    status: "active"
  }
];

function createRun(overrides: Partial<EvaluationRun> = {}): EvaluationRun {
  return {
    id: "eval-1",
    languageId: "avenik",
    createdAt: "2026-07-01T00:00:00.000Z",
    systemVersion: "test",
    fixtureVersion: "test",
    summary: "Evaluation completed.",
    scores: { corpusCoverage: 0.9, noteQuality: 0.8 },
    failures: [],
    ...overrides
  };
}

function renderEvaluationView(overrides: Partial<Parameters<typeof EvaluationView>[0]> = {}) {
  return render(
    <EvaluationView
      evaluations={[]}
      languages={languages}
      selectedLanguageId="avenik"
      isWorkflowBusy={false}
      isEvaluating={false}
      artifactDownload={null}
      artifactError={null}
      isExportingArtifact={false}
      onExportArtifact={vi.fn()}
      {...overrides}
    />
  );
}

describe("EvaluationView", () => {
  it("shows an empty-state hint when there are no runs", () => {
    renderEvaluationView();

    expect(screen.getByRole("status")).toHaveTextContent("No evaluation runs yet.");
    expect(screen.getByText(/Run System Eval/i)).toBeInTheDocument();
  });

  it("shows a loading status while the first evaluation is running", () => {
    renderEvaluationView({ isEvaluating: true });

    expect(screen.getByRole("status")).toHaveTextContent("Evaluating...");
  });

  it("surfaces artifact export errors as alerts", () => {
    renderEvaluationView({
      evaluations: [createRun()],
      artifactError: "Export failed."
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Export failed.");
  });

  it("shows next-step guidance after a single baseline evaluation run", () => {
    renderEvaluationView({
      evaluations: [createRun()]
    });

    const trendPanel = screen.getByRole("region", { name: "Evaluation trends" });
    expect(trendPanel).toHaveTextContent("Run evaluations more than once to show score movement.");
    expect(trendPanel).toHaveTextContent(
      "Baseline captured. Run System Eval again after language changes to compare scores here, or export the artifact below for offline review."
    );
  });
});
