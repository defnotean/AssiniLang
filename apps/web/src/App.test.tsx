import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./api", () => ({
  fetchDashboardData: async () => ({
    languages: [
      {
        id: "avenik",
        name: "Avenik",
        typology: "agglutinative",
        description: "Synthetic agglutinative language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      }
    ],
    corpus: [],
    notes: [],
    exercises: [],
    evaluations: []
  }),
  runEvaluation: async () => []
}));

describe("App", () => {
  it("renders the main synthetic data surfaces", async () => {
    render(<App />);
    expect(await screen.findByText("Synthetic Language Evaluation")).toBeInTheDocument();
    expect(await screen.findByText("Corpus Browser")).toBeInTheDocument();
    expect(await screen.findByText("Note Review Queue")).toBeInTheDocument();
    expect(await screen.findByText("Evaluation Dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Learner Exercise Preview")).toBeInTheDocument();
  });
});
