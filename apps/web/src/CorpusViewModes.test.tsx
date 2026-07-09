import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./lib/apiClient";
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

afterEach(() => {
  cleanup();
});

describe("CorpusView display modes", () => {
  it("shows a Build-oriented empty state when the corpus is empty", () => {
    renderCorpusView([]);

    const emptyState = screen.getByRole("status");
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(emptyState).toHaveTextContent(
      "No saved examples yet. Process a source in Build and accept corpus drafts, or open Add source passage above to import one here."
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

  it("shows a next-step empty state when search matches nothing", () => {
    renderCorpusView();

    fireEvent.change(screen.getByLabelText("Search corpus"), { target: { value: "zzzz-no-match" } });

    const emptyState = screen.getByRole("status");
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveTextContent(
      "No passages match your search. Clear the search box, or clear any active morpheme filter, to widen results."
    );
  });

  it("shows a next-step empty state when morpheme filter and search leave no passages", () => {
    renderCorpusView();

    // talo appears in two passages; "cold" only in the third (no talo) → empty intersection.
    fireEvent.click(screen.getAllByRole("button", { name: /talo\s+walk/ })[0]);
    fireEvent.change(screen.getByLabelText("Search corpus"), { target: { value: "cold" } });

    const emptyState = screen.getByText(/No passages contain the selected morpheme/);
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveTextContent(
      "No passages contain the selected morpheme. Clear the morpheme filter above to show the full corpus again."
    );
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
      const emptyState = screen.getByRole("status");
      expect(emptyState).toHaveClass("empty-state");
      expect(emptyState).toHaveAttribute("aria-live", "polite");
      expect(emptyState).toHaveTextContent(
        "No graph records yet. Process a source in Build and accept corpus or note drafts, or import a passage above, so the graph has records to link."
      );
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

  it("localizes rate-limit and payload-too-large neural map failures", async () => {
    fetchNeuralMapMock.mockRejectedValueOnce(
      new ApiError("Request failed: /observability/neural-map (429): Rate limit exceeded", {
        status: 429,
        i18nKey: "app.rateLimitExceeded",
        i18nParams: { seconds: 5 }
      })
    );
    renderCorpusView();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many requests. Wait 5 seconds, then retry."
      );
    });

    fetchNeuralMapMock.mockRejectedValueOnce(
      new ApiError("Request failed: /observability/neural-map (413): Payload too large", {
        status: 413,
        i18nKey: "errors.payloadTooLarge"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry network" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That request is too large. Shrink the payload or upload a smaller file, then retry."
      );
    });
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

  it("shows a dry-run success notice with prefix without importing", async () => {
    validateCorpusImportMock.mockResolvedValue({
      ok: true,
      errors: [],
      warnings: [],
      preview: {
        morphologicalSegmentation: [
          { surface: "saku", lemma: "child", gloss: "child", features: ["noun"] },
          { surface: "nemi-na", lemma: "teach", gloss: "teach-1sg", features: ["present", "1sg"] }
        ],
        topicTags: ["learning"]
      }
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
      target: { value: "saku|child|child|noun\nnemi-na|teach|teach-1sg|present,1sg" }
    });

    expect(screen.getByText("Validate checks morpheme segmentation and consent fields without importing the passage.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Validate corpus passage import" }));

    await waitFor(() => {
      expect(validateCorpusImportMock).toHaveBeenCalled();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Dry-run only — nothing saved yet.");
    expect(screen.getByRole("status")).toHaveTextContent("Validation passed: 2 morphemes, 1 tags ready to import.");
  });

  it("marks validate busy while dry-run validation is in flight", async () => {
    let resolveValidate: (value: {
      ok: boolean;
      errors: string[];
      warnings: string[];
      preview: null;
    }) => void = () => undefined;
    validateCorpusImportMock.mockImplementation(
      () => new Promise((resolve) => {
        resolveValidate = resolve;
      })
    );

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
      target: { value: "saku|child|child|noun\nnemi-na|teach|teach-1sg|present,1sg" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Validate corpus passage import" }));

    const busyButton = await screen.findByRole("button", { name: "Validate corpus passage import" });
    expect(busyButton).toHaveTextContent("Validating...");
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Import passage" })).toBeDisabled();

    resolveValidate({ ok: true, errors: [], warnings: [], preview: null });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Validate corpus passage import" })).not.toHaveAttribute("aria-busy", "true");
    });
    expect(screen.getByRole("button", { name: "Validate corpus passage import" })).toHaveTextContent("Validate");
  });
});
