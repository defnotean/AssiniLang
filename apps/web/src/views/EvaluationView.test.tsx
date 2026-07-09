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

  it("announces export success with aria-live status messaging and a downloadable href", () => {
    const href = "data:application/json;charset=utf-8,%7B%22ok%22%3Atrue%7D";
    renderEvaluationView({
      evaluations: [createRun()],
      artifactDownload: {
        fileName: "assini-evaluation-artifact.json",
        href,
        summary: "Evaluation artifact ready: 1 latest run, 0 failed latest runs.",
        exportedAt: "2026-07-01T00:00:00.000Z"
      }
    });

    const exportStatus = screen.getByText("Evaluation artifact exported.").closest("[aria-live]");
    expect(exportStatus).toHaveAttribute("role", "status");
    expect(exportStatus).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/1 latest run/)).toBeInTheDocument();

    const downloadLink = screen.getByRole("link", { name: "Download evaluation artifact JSON" });
    expect(downloadLink).toHaveAttribute("href", href);
    expect(downloadLink).toHaveAttribute("download", "assini-evaluation-artifact.json");
  });

  it("surfaces artifact export errors as alerts", () => {
    renderEvaluationView({
      evaluations: [createRun()],
      artifactError: "Export failed."
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Export failed.");
  });

  it("disables the export button and marks it busy while an export is in progress", () => {
    renderEvaluationView({
      evaluations: [createRun()],
      isExportingArtifact: true
    });

    const exportButton = screen.getByRole("button", { name: "Exporting..." });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAttribute("aria-busy", "true");
  });

  it("shows next-step guidance after a single baseline evaluation run", () => {
    renderEvaluationView({
      evaluations: [createRun()]
    });

    const trendPanel = screen.getByRole("region", { name: "Evaluation trends" });
    expect(trendPanel).toHaveTextContent("0 comparisons");
    expect(trendPanel).toHaveTextContent("Run evaluations more than once to show score movement.");
    expect(trendPanel).toHaveTextContent(
      "Baseline captured. Run System Eval again after language changes to compare scores here, or export the artifact below for offline review."
    );
  });

  it("localizes trend point and metric labels when comparing runs", () => {
    renderEvaluationView({
      evaluations: [
        createRun({
          id: "eval-old",
          createdAt: "2026-06-02T00:00:00.000Z",
          scores: { corpusCoverage: 1, noteQuality: 0.9 }
        }),
        createRun({
          id: "eval-latest",
          createdAt: "2026-06-03T00:00:00.000Z",
          scores: { corpusCoverage: 0.9, noteQuality: 0.8 }
        })
      ]
    });

    const trendPanel = screen.getByRole("region", { name: "Evaluation trends" });
    expect(trendPanel).toHaveTextContent("1 comparison");
    expect(trendPanel).toHaveTextContent("Avenik regressed by 10 pts since previous run.");
    expect(trendPanel).toHaveTextContent("Note quality -10 pts");
    expect(trendPanel).toHaveTextContent("Corpus coverage -10 pts");
    expect(screen.getByRole("progressbar", { name: "Note quality" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Corpus coverage" })).toBeInTheDocument();
  });

  it("localizes failure category labels in the latest-run breakdown", () => {
    renderEvaluationView({
      evaluations: [
        createRun({
          failures: [
            {
              category: "noteAccuracy",
              languageId: "avenik",
              itemId: "note-1",
              message: "Missing note content for verb chains"
            }
          ]
        })
      ]
    });

    expect(screen.getByText("Note accuracy note-1: Missing note content for verb chains")).toBeInTheDocument();
    expect(screen.queryByText(/noteAccuracy/)).not.toBeInTheDocument();
  });
});
