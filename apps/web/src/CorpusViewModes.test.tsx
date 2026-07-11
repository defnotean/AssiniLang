import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./lib/apiClient";
import { CorpusView } from "./views/CorpusView";
import type { CorpusPassage } from "./lib/types";

const fetchNeuralMapMock = vi.fn();
const validateCorpusImportMock = vi.fn();
const validateCorpusBulkMock = vi.fn();
const onImportCorpusBulkMock = vi.fn();

vi.mock("./api/aiSessionApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/aiSessionApi")>();
  return {
    ...actual,
    fetchNeuralMap: (...args: unknown[]) => fetchNeuralMapMock(...args)
  };
});

vi.mock("./api/studyApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/studyApi")>();
  return {
    ...actual,
    validateCorpusImport: (...args: unknown[]) => validateCorpusImportMock(...args),
    validateCorpusBulk: (...args: unknown[]) => validateCorpusBulkMock(...args)
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

const BULK_HEADER = [
  "target",
  "translation",
  "source",
  "author",
  "year",
  "license",
  "consentRecord",
  "consentUse",
  "tags",
  "morphemes"
].join("\t");

function bulkTsvRow(overrides: Partial<Record<string, string>> = {}): string {
  const values = {
    target: "mira talo-mi-na",
    translation: "I walk by the river.",
    source: "field-import",
    author: "Local Reviewer",
    year: "2026",
    license: "cc-by",
    consentRecord: "local import consent",
    consentUse: "community-approved",
    tags: "motion",
    morphemes: "mira | mira | river | noun; talo-mi-na | talo | walk.present.1sg | verb",
    ...overrides
  };
  return [
    values.target,
    values.translation,
    values.source,
    values.author,
    values.year,
    values.license,
    values.consentRecord,
    values.consentUse,
    values.tags,
    values.morphemes
  ].join("\t");
}

function renderCorpusView(corpus = createCorpus()) {
  return render(
    <CorpusView
      languageId="avenik"
      corpus={corpus}
      isWorkflowBusy={false}
      onImportCorpusPassage={vi.fn()}
      onImportCorpusBulk={onImportCorpusBulkMock}
    />
  );
}

const INTERACTIVE_GRAPH = {
  languageId: "avenik",
  nodes: [
    { id: "language:avenik", type: "language", label: "Avenik", metadata: {} },
    {
      id: "corpus:avn-c001",
      type: "corpus",
      label: "mira talo-mi-na with a deliberately complete label",
      metadata: {}
    },
    { id: "morpheme:avenik:mira", type: "morpheme", label: "mira", metadata: {} },
    { id: "topic_tag:avenik:movement", type: "topic_tag", label: "movement", metadata: {} },
    { id: "note:avenik:fieldwork", type: "note", label: "Fieldwork note", metadata: {} }
  ],
  edges: [
    { source: "language:avenik", target: "corpus:avn-c001", relation: "has_corpus", weight: 1 },
    { source: "corpus:avn-c001", target: "morpheme:avenik:mira", relation: "contains_morpheme", weight: 0.8 },
    { source: "corpus:avn-c001", target: "topic_tag:avenik:movement", relation: "tagged", weight: 0.7 },
    { source: "language:avenik", target: "note:avenik:fieldwork", relation: "has_note", weight: 1 }
  ]
};

async function renderReadyGraph(graph = INTERACTIVE_GRAPH) {
  fetchNeuralMapMock.mockResolvedValue(graph);
  renderCorpusView();
  fireEvent.click(screen.getByRole("button", { name: "Graph" }));
  return waitFor(() => screen.getByRole("img", { name: "Corpus neural network" }));
}

beforeEach(() => {
  fetchNeuralMapMock.mockReset();
  validateCorpusImportMock.mockReset();
  validateCorpusBulkMock.mockReset();
  onImportCorpusBulkMock.mockReset();
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

    const loading = screen.getByRole("status");
    expect(loading).toHaveClass("empty-state");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent("Loading corpus graph...");
    expect(loading).toHaveTextContent("Fetching linked passages, notes, sources, and morphemes for this language.");
    expect(fetchNeuralMapMock).toHaveBeenCalledWith("avenik");
  });

  it("filters visible nodes and their connected links by node type", async () => {
    const graph = await renderReadyGraph();
    const passageFilter = screen.getByRole("checkbox", { name: "Passage, 1 available" });

    expect(within(graph).getByRole("button", { name: /Passage: mira talo-mi-na/ })).toBeInTheDocument();
    expect(passageFilter).toBeChecked();

    fireEvent.click(passageFilter);

    expect(passageFilter).not.toBeChecked();
    expect(within(graph).queryByRole("button", { name: /Passage: mira talo-mi-na/ })).not.toBeInTheDocument();
    expect(screen.getByText("4 nodes")).toBeInTheDocument();
    expect(screen.getByText("1 links")).toBeInTheDocument();
  });

  it("selects SVG nodes by click and keyboard and shows complete node details", async () => {
    const graph = await renderReadyGraph();
    const details = screen.getByLabelText("Selected node details");
    const passageNode = within(graph).getByRole("button", { name: /Passage: mira talo-mi-na/ });

    expect(details).toHaveTextContent("Select a graph node to inspect its details.");
    fireEvent.click(passageNode);

    expect(passageNode).toHaveAttribute("aria-pressed", "true");
    expect(within(details).getByText("mira talo-mi-na with a deliberately complete label")).toBeInTheDocument();
    expect(within(details).getByText("Passage")).toBeInTheDocument();
    expect(within(details).getByText("corpus:avn-c001")).toBeInTheDocument();
    expect(within(details).getByText("Connected relations").nextElementSibling).toHaveTextContent("3");

    const noteNode = within(graph).getByRole("button", { name: /Note: Fieldwork note/ });
    fireEvent.keyDown(noteNode, { key: "Enter" });

    expect(noteNode).toHaveAttribute("aria-pressed", "true");
    expect(within(details).getByText("Fieldwork note")).toBeInTheDocument();
    expect(within(details).getByText("note:avenik:fieldwork")).toBeInTheDocument();
    expect(within(details).getByText("Connected relations").nextElementSibling).toHaveTextContent("1");
  });

  it("zooms the graph through its viewBox and resets without resizing the canvas", async () => {
    const graph = await renderReadyGraph();
    const initialViewBox = "0 0 920 540";
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const reset = screen.getByRole("button", { name: "Reset zoom" });

    expect(graph).toHaveAttribute("viewBox", initialViewBox);
    expect(zoomIn).toHaveAttribute("title", "Zoom in");
    expect(reset).toBeDisabled();

    fireEvent.click(zoomIn);
    expect(graph).not.toHaveAttribute("viewBox", initialViewBox);
    expect(screen.getByText("Zoom: 125%")).toBeInTheDocument();

    fireEvent.click(zoomOut);
    expect(graph).toHaveAttribute("viewBox", initialViewBox);

    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    expect(screen.getByText("Zoom: 150%")).toBeInTheDocument();
    fireEvent.click(reset);

    expect(graph).toHaveAttribute("viewBox", initialViewBox);
    expect(screen.getByText("Zoom: 100%")).toBeInTheDocument();
  });

  it("prioritizes linguistic evidence over ancillary records at the node cap", async () => {
    const ancillaryNodes = Array.from({ length: 96 }, (_, index) => ({
      id: `note:${String(index).padStart(3, "0")}`,
      type: "note",
      label: `Note ${String(index).padStart(2, "0")}`,
      metadata: {}
    }));
    const graph = await renderReadyGraph({
      languageId: "avenik",
      nodes: [
        ...ancillaryNodes,
        { id: "language:priority", type: "language", label: "Priority language", metadata: {} },
        { id: "corpus:priority", type: "corpus", label: "Priority passage", metadata: {} },
        { id: "morpheme:priority", type: "morpheme", label: "Priority morpheme", metadata: {} },
        { id: "topic_tag:priority", type: "topic_tag", label: "Priority topic", metadata: {} }
      ],
      edges: []
    });

    expect(screen.getByText("96 nodes")).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: /Language: Priority language/ })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: /Passage: Priority passage/ })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: /Morpheme: Priority morpheme/ })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: /Topic: Priority topic/ })).toBeInTheDocument();
    expect(within(graph).queryByRole("button", { name: /Note: Note 95/ })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 96 of 100 nodes and 0 of 0 links.")).toBeInTheDocument();
  });

  it("shows an empty state with single and bulk import paths when the neural map has no nodes", async () => {
    fetchNeuralMapMock.mockResolvedValue({ nodes: [], edges: [] });
    renderCorpusView();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    await waitFor(() => {
      const emptyState = screen.getByRole("status");
      expect(emptyState).toHaveClass("empty-state");
      expect(emptyState).toHaveAttribute("aria-live", "polite");
      expect(emptyState).toHaveTextContent(
        "No graph records yet. The network links passages, notes, sources, and morphemes for this language."
      );
      expect(emptyState).toHaveTextContent(
        "Process a source in Build and accept corpus or note drafts, or add passages here to seed the graph."
      );
    });

    const emptyState = screen.getByRole("status");
    expect(within(emptyState).getByRole("button", { name: "Add source passage" })).toBeInTheDocument();
    expect(within(emptyState).getByRole("button", { name: "Paste bulk passages" })).toBeInTheDocument();

    fireEvent.click(within(emptyState).getByRole("button", { name: "Add source passage" }));
    expect(screen.getByLabelText("Corpus target text")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("No graph records yet.");
    });
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Paste bulk passages" }));
    expect(screen.getByLabelText("Bulk TSV or CSV paste")).toBeInTheDocument();
  });

  it("asks for a language when graph mode has no language id", () => {
    render(
      <CorpusView
        corpus={[]}
        isWorkflowBusy={false}
        onImportCorpusPassage={vi.fn()}
        onImportCorpusBulk={onImportCorpusBulkMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    const emptyState = screen.getByRole("status");
    expect(emptyState).toHaveTextContent("Select a language to load its corpus graph.");
    expect(fetchNeuralMapMock).not.toHaveBeenCalled();
  });

  it("shows a retry action when the neural map request fails", async () => {
    fetchNeuralMapMock.mockRejectedValueOnce(new Error("Request failed: /observability/neural-map (503): Offline"));
    renderCorpusView();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Offline");
      expect(alert).toHaveTextContent(
        "Check your connection, then retry. If the graph stays empty after it loads, add a passage or bulk import below."
      );
      expect(within(alert).getByRole("button", { name: "Retry network" })).toBeInTheDocument();
      expect(within(alert).getByRole("button", { name: "Add source passage" })).toBeInTheDocument();
      expect(within(alert).getByRole("button", { name: "Paste bulk passages" })).toBeInTheDocument();
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
      expect(screen.getByRole("alert")).toHaveTextContent("Too many requests. Wait 5 seconds, then retry.");
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
      expect(validateCorpusImportMock).toHaveBeenCalledWith(
        "avenik",
        expect.objectContaining({
          textTarget: "saku nemi-na"
        })
      );
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

    expect(
      screen.getByText("Validate checks morpheme segmentation and consent fields without importing the passage.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Validate corpus passage import" }));

    const status = await screen.findByRole("status");
    expect(validateCorpusImportMock).toHaveBeenCalled();
    expect(status).toHaveTextContent("Dry-run only — nothing saved yet.");
    expect(status).toHaveTextContent("Validation passed: 2 morphemes, 1 tags ready to import.");
  });

  it("marks validate busy while dry-run validation is in flight", async () => {
    let resolveValidate: (value: { ok: boolean; errors: string[]; warnings: string[]; preview: null }) => void = () =>
      undefined;
    validateCorpusImportMock.mockImplementation(
      () =>
        new Promise((resolve) => {
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
      expect(screen.getByRole("button", { name: "Validate corpus passage import" })).not.toHaveAttribute(
        "aria-busy",
        "true"
      );
    });
    expect(screen.getByRole("button", { name: "Validate corpus passage import" })).toHaveTextContent("Validate");
  });
});

describe("CorpusView bulk import", () => {
  it("validates bulk paste with client dry-run and optional server grounding", async () => {
    validateCorpusBulkMock.mockResolvedValue({
      ok: true,
      dryRun: true,
      imported: 1,
      failed: 0,
      results: [{ index: 0, ok: true, warnings: [], preview: null }]
    });

    renderCorpusView();
    fireEvent.click(screen.getByRole("button", { name: /Paste bulk passages/i }));
    fireEvent.change(screen.getByLabelText("Bulk TSV or CSV paste"), {
      target: { value: [BULK_HEADER, bulkTsvRow()].join("\n") }
    });

    fireEvent.click(screen.getByRole("button", { name: "Validate bulk corpus import" }));

    await waitFor(() => {
      expect(validateCorpusBulkMock).toHaveBeenCalledWith("avenik", [
        expect.objectContaining({ textTarget: "mira talo-mi-na" })
      ]);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Dry-run only — nothing saved yet.");
    expect(screen.getByRole("status")).toHaveTextContent("1 ready, 0 failed of 1 rows.");
    expect(screen.getByRole("status")).toHaveTextContent("Server grounding: 1 ready, 0 failed of 1 checked.");
    expect(onImportCorpusBulkMock).not.toHaveBeenCalled();
  });

  it("imports valid bulk rows and shows imported count", async () => {
    onImportCorpusBulkMock.mockResolvedValue({
      ok: true,
      dryRun: false,
      imported: 1,
      failed: 0,
      results: [{ index: 0, ok: true, warnings: [], passage: createCorpus()[0] }]
    });

    renderCorpusView();
    fireEvent.click(screen.getByRole("button", { name: /Paste bulk passages/i }));
    fireEvent.change(screen.getByLabelText("Bulk TSV or CSV paste"), {
      target: { value: [BULK_HEADER, bulkTsvRow()].join("\n") }
    });

    fireEvent.click(screen.getByRole("button", { name: "Import valid rows" }));

    await waitFor(() => {
      expect(onImportCorpusBulkMock).toHaveBeenCalledWith([expect.objectContaining({ textTarget: "mira talo-mi-na" })]);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Imported 1 passage(s).");
    expect(screen.getByLabelText("Bulk TSV or CSV paste")).toHaveValue("");
  });

  it("shows partial failure counts after bulk import", async () => {
    onImportCorpusBulkMock.mockResolvedValue({
      ok: false,
      dryRun: false,
      imported: 1,
      failed: 1,
      results: [
        { index: 0, ok: true, warnings: [], passage: createCorpus()[0] },
        {
          index: 1,
          ok: false,
          error: "Corpus morpheme is not grounded",
          i18nKey: "errors.corpusImportValidationFailed",
          warnings: []
        }
      ]
    });

    renderCorpusView();
    fireEvent.click(screen.getByRole("button", { name: /Paste bulk passages/i }));
    fireEvent.change(screen.getByLabelText("Bulk TSV or CSV paste"), {
      target: {
        value: [
          BULK_HEADER,
          bulkTsvRow(),
          bulkTsvRow({
            target: "selu mira-ka",
            translation: "The river is cold.",
            morphemes: "selu | selu | cold | adj; mira-ka | mira | river | noun"
          })
        ].join("\n")
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Import valid rows" }));

    await waitFor(() => {
      expect(onImportCorpusBulkMock).toHaveBeenCalled();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Imported 1 passage(s); 1 failed.");
    expect(screen.getByRole("alert")).toHaveTextContent("Server row 2: Corpus morpheme is not grounded");
  });
});
