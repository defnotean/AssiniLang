import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusView } from "./views/CorpusView";
import type { CorpusPassage } from "./lib/types";

const fetchNeuralMapMock = vi.fn();
const validateCorpusImportMock = vi.fn();

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
    validateCorpusImport: (...args: unknown[]) => validateCorpusImportMock(...args)
  };
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtureRoot = join(repoRoot, "fixtures", "corpus-graph");
const seedPath = join(fixtureRoot, "seed.json");
const expectedMapPath = join(fixtureRoot, "expected-neural-map.json");
const manifestPath = join(fixtureRoot, "manifest.json");

type CorpusGraphManifest = {
  fixtureVersion: string;
  languageId: string;
  expected: {
    nodeCount: number;
    edgeCount: number;
  };
};

type CorpusGraphSeed = {
  language: { id: string; name: string };
  corpus: CorpusPassage[];
};

type ExpectedNeuralMap = {
  languageId: string;
  nodes: Array<{ id: string; type: string; label: string; metadata?: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string; relation: string; weight?: number }>;
};

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  fetchNeuralMapMock.mockReset();
  validateCorpusImportMock.mockReset();
});

describe("corpus graph-rendering fixture (web)", () => {
  it("renders SVG nodes and edges for the synthetic language neural map", async () => {
    const manifest = await loadJson<CorpusGraphManifest>(manifestPath);
    const seed = await loadJson<CorpusGraphSeed>(seedPath);
    const expected = await loadJson<ExpectedNeuralMap>(expectedMapPath);

    expect(manifest.fixtureVersion).toBe("corpus-graph-rendering-v1");
    expect(expected.nodes).toHaveLength(manifest.expected.nodeCount);
    expect(expected.edges).toHaveLength(manifest.expected.edgeCount);

    fetchNeuralMapMock.mockResolvedValue(expected);

    render(
      <CorpusView
        languageId={seed.language.id}
        corpus={seed.corpus}
        isWorkflowBusy={false}
        onImportCorpusPassage={vi.fn()}
        onImportCorpusBulk={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    await waitFor(() => {
      expect(screen.getByText(`${manifest.expected.nodeCount} nodes`)).toBeInTheDocument();
    });
    expect(screen.getByText(`${manifest.expected.edgeCount} links`)).toBeInTheDocument();
    expect(fetchNeuralMapMock).toHaveBeenCalledWith(seed.language.id);

    const svg = screen.getByRole("img", { name: "Corpus neural network" });
    expect(svg).toHaveAttribute("viewBox", "0 0 920 540");

    const nodeGroups = svg.querySelectorAll("g.network-nodes > g.network-node");
    expect(nodeGroups).toHaveLength(manifest.expected.nodeCount);

    const titleTexts = [...svg.querySelectorAll("g.network-nodes title")].map((title) => title.textContent ?? "");
    expect(titleTexts).toHaveLength(manifest.expected.nodeCount);
    for (const node of expected.nodes) {
      expect(
        titleTexts.some((text) => text.endsWith(`: ${node.label}`)),
        node.label
      ).toBe(true);
    }

    for (const node of expected.nodes) {
      expect(within(svg).getByText(node.label)).toBeInTheDocument();
    }

    const edgeLines = svg.querySelectorAll("g.network-edges > line");
    expect(edgeLines).toHaveLength(manifest.expected.edgeCount);

    const relations = [...edgeLines].map((line) => line.getAttribute("data-relation"));
    expect(relations).toEqual(
      expect.arrayContaining([
        "has_corpus",
        "from_source",
        "contains_morpheme",
        "tagged",
        "co_occurs",
        "has_note",
        "uses_context"
      ])
    );

    for (const line of edgeLines) {
      expect(Number(line.getAttribute("x1"))).not.toBeNaN();
      expect(Number(line.getAttribute("y1"))).not.toBeNaN();
      expect(Number(line.getAttribute("x2"))).not.toBeNaN();
      expect(Number(line.getAttribute("y2"))).not.toBeNaN();
    }

    const insights = screen.getByLabelText("Corpus graph insights");
    expect(within(insights).getByText("Passages")).toBeInTheDocument();
    expect(within(insights).getByText("Morphemes")).toBeInTheDocument();
    expect(within(insights).getByText("Topics")).toBeInTheDocument();
    expect(within(insights).getByText("Sources")).toBeInTheDocument();
    expect(within(insights).getByText("Notes")).toBeInTheDocument();
    expect(within(insights).getByText("4")).toBeInTheDocument();
  });
});
