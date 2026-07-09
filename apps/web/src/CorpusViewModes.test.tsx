import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CorpusView } from "./views/CorpusView";
import type { CorpusPassage } from "./lib/types";

const fetchNeuralMapMock = vi.fn();
const validateCorpusImportMock = vi.fn();

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    fetchNeuralMap: (...args: unknown[]) => fetchNeuralMapMock(...args),
    validateCorpusImport: (...args: unknown[]) => validateCorpusImportMock(...args)
  };
});

function createCorpus(): CorpusPassage[] {
  return [
    {
      id: "avn-c001",
      languageId: "avenik",
      source: "field-recording",
      sourceMetadata: {
        author: "fixture-author",
        year: 2026,
        license: "cc-by",
        consentRecord: "community-consent-001"
      },
      textTarget: "mira talo-mi-na",
      textTranslation: "I walk by the river.",
      morphologicalSegmentation: [
        { surface: "mira", lemma: "river", gloss: "river", features: [] },
        { surface: "talo", lemma: "walk", gloss: "walk", features: [] }
      ],
      topicTags: ["movement"],
      consentStatus: { use: "testing-only", restrictions: [] }
    },
    {
      id: "avn-c002",
      languageId: "avenik",
      source: "elicitation-session",
      sourceMetadata: {
        author: "fixture-author",
        year: 2026,
        license: "cc-by",
        consentRecord: "community-consent-002"
      },
      textTarget: "selu mira-ka",
      textTranslation: "The river is cold.",
      morphologicalSegmentation: [
        { surface: "selu", lemma: "cold", gloss: "cold", features: [] },
        { surface: "mira", lemma: "river", gloss: "river", features: [] }
      ],
      topicTags: ["weather"],
      consentStatus: { use: "testing-only", restrictions: [] }
    },
    {
      id: "avn-c003",
      languageId: "avenik",
      source: "field-recording",
      sourceMetadata: {
        author: "fixture-author",
        year: 2026,
        license: "cc-by",
        consentRecord: "community-consent-003"
      },
      textTarget: "talo-na kesi",
      textTranslation: "We walk together.",
      morphologicalSegmentation: [
        { surface: "talo", lemma: "walk", gloss: "walk", features: [] },
        { surface: "kesi", lemma: "together", gloss: "together", features: [] }
      ],
      topicTags: ["movement"],
      consentStatus: { use: "testing-only", restrictions: [] }
    }
  ] as CorpusPassage[];
}

function renderCorpusView(corpus = createCorpus()) {
  return render(
    <CorpusView
      languageId="avenik"
      corpus={corpus}
      isWorkflowBusy={false}
      onImportCorpusPassage={vi.fn()}
    />
  );
}

beforeEach(() => {
  fetchNeuralMapMock.mockReset();
  validateCorpusImportMock.mockReset();
});

describe("CorpusView display modes", () => {
  it("shows a Build-oriented empty state when the corpus is empty", () => {
    renderCorpusView([]);

    expect(screen.getByRole("status")).toHaveTextContent(
      "No saved examples yet. Process a source in Build and accept corpus drafts to populate this list."
    );
  });

  it("defaults to card mode and exposes an interlinear toggle", () => {
    renderCorpusView();

    const toggle = screen.getByRole("group", { name: "Corpus display mode" });
    expect(within(toggle).getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    expect(within(toggle).getByRole("button", { name: "Interlinear" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("mira talo-mi-na")).toBeInTheDocument();
  });

  it("renders aligned surface and gloss lines plus the free translation in interlinear mode", () => {
    renderCorpusView();

    fireEvent.click(screen.getByRole("button", { name: "Interlinear" }));
    expect(screen.getByRole("button", { name: "Interlinear" })).toHaveAttribute("aria-pressed", "true");

    const list = screen.getByRole("region", { name: "Corpus passages" });
    const firstPassage = within(list).getByText("avn-c001").closest("article");
    expect(firstPassage).not.toBeNull();
    const word = within(firstPassage as HTMLElement).getByRole("button", { name: /mira\s+river/ });
    expect(within(word).getByText("mira")).toHaveClass("igt-surface");
    expect(within(word).getByText("river")).toHaveClass("igt-gloss");
    expect(within(firstPassage as HTMLElement).getByText("I walk by the river.")).toHaveClass("igt-translation");
  });
});

describe("CorpusView concordance filter", () => {
  it("filters passages to those containing a clicked morpheme chip", () => {
    renderCorpusView();

    expect(screen.getByText("3 of 3 passages")).toBeInTheDocument();
    const chips = screen.getAllByRole("button", { name: /talo\s+walk/ });
    fireEvent.click(chips[0]);

    expect(screen.getByText("2 of 3 passages")).toBeInTheDocument();
    expect(screen.getByText("mira talo-mi-na")).toBeInTheDocument();
    expect(screen.getByText("talo-na kesi")).toBeInTheDocument();
    expect(screen.queryByText("selu mira-ka")).not.toBeInTheDocument();
    expect(screen.getByText(/2 passages containing talo/)).toBeInTheDocument();
  });

  it("marks the active morpheme chip as pressed", () => {
    renderCorpusView();

    const chip = screen.getAllByRole("button", { name: /mira\s+river/ })[0];
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);

    const pressed = screen.getAllByRole("button", { name: /mira\s+river/ });
    for (const candidate of pressed) {
      expect(candidate).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("clears the filter from the active-filter pill", () => {
    renderCorpusView();

    fireEvent.click(screen.getAllByRole("button", { name: /talo\s+walk/ })[0]);
    expect(screen.getByText("2 of 3 passages")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear morpheme filter talo" }));

    expect(screen.getByText("3 of 3 passages")).toBeInTheDocument();
    expect(screen.queryByText(/Morpheme: talo/)).not.toBeInTheDocument();
  });

  it("toggles the filter off when the same morpheme is clicked again", () => {
    renderCorpusView();

    const chip = screen.getAllByRole("button", { name: /mira\s+river/ })[0];
    fireEvent.click(chip);
    expect(screen.getByText("2 of 3 passages")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /mira\s+river/ })[0]);
    expect(screen.getByText("3 of 3 passages")).toBeInTheDocument();
  });

  it("keeps the concordance filter working in interlinear mode", () => {
    renderCorpusView();

    fireEvent.click(screen.getByRole("button", { name: "Interlinear" }));
    fireEvent.click(screen.getAllByRole("button", { name: /selu\s+cold/ })[0]);

    expect(screen.getByText("1 of 3 passages")).toBeInTheDocument();
    expect(screen.getByText("The river is cold.")).toBeInTheDocument();
    expect(screen.queryByText("I walk by the river.")).not.toBeInTheDocument();
  });

  it("combines text search and morpheme filter", () => {
    renderCorpusView();

    fireEvent.click(screen.getAllByRole("button", { name: /mira\s+river/ })[0]);
    fireEvent.change(screen.getByLabelText("Search corpus"), { target: { value: "cold" } });

    expect(screen.getByText("1 of 3 passages")).toBeInTheDocument();
    expect(screen.getByText("selu mira-ka")).toBeInTheDocument();
  });
});

describe("CorpusView network graph mode", () => {
  it("shows a loading state while the neural map is fetched", async () => {
    fetchNeuralMapMock.mockReturnValue(new Promise(() => undefined));
    renderCorpusView();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(screen.getByText("Loading corpus graph...")).toBeInTheDocument();
    expect(fetchNeuralMapMock).toHaveBeenCalledWith("avenik");
  });

  it("shows an empty state when the neural map has no nodes", async () => {
    fetchNeuralMapMock.mockResolvedValue({ nodes: [], edges: [] });
    renderCorpusView();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    await waitFor(() => {
      expect(screen.getByText("No graph records are available for this corpus.")).toBeInTheDocument();
    });
  });

  it("shows a retry action when the neural map request fails", async () => {
    fetchNeuralMapMock.mockRejectedValueOnce(new Error("Request failed: /observability/neural-map (503): Offline"));
    renderCorpusView();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Offline");
    });

    fetchNeuralMapMock.mockResolvedValueOnce({
      nodes: [{ id: "lang-1", type: "language", label: "Avenik" }],
      edges: []
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry network" }));

    await waitFor(() => {
      expect(screen.getByText("1 nodes")).toBeInTheDocument();
    });
    expect(fetchNeuralMapMock).toHaveBeenCalledTimes(2);
  });
});

describe("CorpusView import validation", () => {
  it("calls dry-run validation and shows the server error without importing", async () => {
    validateCorpusImportMock.mockResolvedValue({
      ok: false,
      errors: ["Corpus segmentation surface is not present in target text: ghost"],
      warnings: [],
      preview: null
    });

    renderCorpusView();
    fireEvent.click(screen.getByRole("button", { name: /Add source passage/i }));

    fireEvent.change(screen.getByLabelText("Corpus target text"), { target: { value: "saku nemi-na" } });
    fireEvent.change(screen.getByLabelText("English translation"), { target: { value: "The child teaches me." } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "local-import" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "Local Reviewer" } });
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText("License"), { target: { value: "local-test-data" } });
    fireEvent.change(screen.getByLabelText("Consent record"), { target: { value: "local import consent" } });
    fireEvent.change(screen.getByLabelText("Topic tags"), { target: { value: "learning" } });
    fireEvent.change(screen.getByLabelText("Morpheme segmentation"), {
      target: { value: "ghost|ghost|ghost|noun" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Validate corpus passage import" }));

    await waitFor(() => {
      expect(validateCorpusImportMock).toHaveBeenCalledWith("avenik", expect.objectContaining({
        textTarget: "saku nemi-na"
      }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("ghost");
  });
});
