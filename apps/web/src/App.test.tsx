import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const apiMock = vi.hoisted(() => ({
  fetchDashboardData: vi.fn(),
  runEvaluation: vi.fn()
}));

vi.mock("./api", () => apiMock);

function createDashboardData() {
  return {
    languages: [
      {
        id: "avenik",
        name: "Avenik",
        typology: "agglutinative",
        description: "Synthetic agglutinative language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      },
      {
        id: "solari",
        name: "Solari",
        typology: "isolating",
        description: "Synthetic isolating language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      }
    ],
    corpus: [],
    notes: [],
    exercises: [],
    evaluations: []
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe("App", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main synthetic data surfaces", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.runEvaluation.mockResolvedValue([]);

    render(<App />);
    expect(await screen.findByText("Synthetic Language Evaluation")).toBeInTheDocument();
    expect(await screen.findByText("Corpus Browser")).toBeInTheDocument();
    expect(await screen.findByText("Note Review Queue")).toBeInTheDocument();
    expect(await screen.findByText("Evaluation Dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Learner Exercise Preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Avenik/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Solari/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("announces loading state through a live status region", async () => {
    const initialLoad = createDeferred<ReturnType<typeof createDashboardData>>();
    apiMock.fetchDashboardData.mockReturnValue(initialLoad.promise);

    render(<App />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading synthetic data...");

    initialLoad.resolve(createDashboardData());
    expect(await screen.findByText("Corpus Browser")).toBeInTheDocument();
  });

  it("announces load errors through an alert region", async () => {
    apiMock.fetchDashboardData.mockRejectedValue(new Error("Synthetic data unavailable"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic data unavailable");
  });

  it("disables language switching while an evaluation refresh is in flight", async () => {
    const evaluationRun = createDeferred<unknown[]>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.runEvaluation.mockReturnValue(evaluationRun.promise);

    render(<App />);

    const solariButton = await screen.findByRole("button", { name: /Solari/ });
    fireEvent.click(screen.getByRole("button", { name: "Run Evaluation" }));

    await waitFor(() => expect(solariButton).toBeDisabled());

    fireEvent.click(solariButton);

    expect(apiMock.fetchDashboardData).not.toHaveBeenCalledWith("solari");

    evaluationRun.resolve([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Evaluation" })).toBeEnabled());
  });
});
