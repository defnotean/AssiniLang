import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LOCAL_PROTOTYPE_USERS,
  appStateSchema,
  createEmptyState,
  type AppState,
  type CorpusPassage,
  type Language,
  type Note,
  type SourceAsset
} from "@assini/db";
import { buildNeuralMap } from "./routeHelpers.js";
import { createServer } from "./server.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtureRoot = join(repoRoot, "fixtures", "corpus-graph");
const manifestPath = join(fixtureRoot, "manifest.json");
const seedPath = join(fixtureRoot, "seed.json");
const expectedMapPath = join(fixtureRoot, "expected-neural-map.json");

type CorpusGraphManifest = {
  fixtureVersion: string;
  languageId: string;
  files: { seed: string; expectedNeuralMap: string };
  expected: {
    nodeCount: number;
    edgeCount: number;
    nodeTypes: Record<string, number>;
    requiredNodeIds: string[];
    requiredEdgeRelations: string[];
  };
};

type CorpusGraphSeed = {
  language: Language;
  sourceAsset: SourceAsset;
  corpus: CorpusPassage[];
  notes: Note[];
};

type ExpectedNeuralMap = {
  languageId: string;
  nodes: Array<{ id: string; type: string; label: string; metadata: Record<string, string | number | boolean> }>;
  edges: Array<{ source: string; target: string; relation: string; weight?: number }>;
};

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function buildFixtureState(seed: CorpusGraphSeed): AppState {
  const state = createEmptyState();
  state.users.push(...LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user })));
  state.languages.push(seed.language);
  state.sourceAssets.push(seed.sourceAsset);
  state.corpus.push(...seed.corpus);
  state.notes.push(...seed.notes);
  return appStateSchema.parse(state);
}

describe("corpus graph-rendering fixture pack", () => {
  it("loads the committed seed and expected neural map", async () => {
    const manifest = await loadJson<CorpusGraphManifest>(manifestPath);
    const seed = await loadJson<CorpusGraphSeed>(seedPath);
    const expected = await loadJson<ExpectedNeuralMap>(expectedMapPath);

    expect(manifest.fixtureVersion).toBe("corpus-graph-rendering-v1");
    expect(manifest.languageId).toBe("velmari-graph");
    expect(seed.language.id).toBe(manifest.languageId);
    expect(seed.corpus).toHaveLength(2);
    expect(seed.notes).toHaveLength(1);
    expect(expected.nodes).toHaveLength(manifest.expected.nodeCount);
    expect(expected.edges).toHaveLength(manifest.expected.edgeCount);
  });

  it("builds the exact neural map for the synthetic language seed", async () => {
    const manifest = await loadJson<CorpusGraphManifest>(manifestPath);
    const seed = await loadJson<CorpusGraphSeed>(seedPath);
    const expected = await loadJson<ExpectedNeuralMap>(expectedMapPath);
    const state = buildFixtureState(seed);

    const neuralMap = buildNeuralMap(state, manifest.languageId);

    expect(neuralMap).toEqual(expected);

    const nodeTypeCounts = neuralMap.nodes.reduce<Record<string, number>>((counts, node) => {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
      return counts;
    }, {});
    expect(nodeTypeCounts).toEqual(manifest.expected.nodeTypes);

    for (const nodeId of manifest.expected.requiredNodeIds) {
      expect(
        neuralMap.nodes.some((node) => node.id === nodeId),
        nodeId
      ).toBe(true);
    }

    const relations = new Set(neuralMap.edges.map((edge) => edge.relation));
    for (const relation of manifest.expected.requiredEdgeRelations) {
      expect(relations.has(relation), relation).toBe(true);
    }

    const nodeIds = new Set(neuralMap.nodes.map((node) => node.id));
    for (const edge of neuralMap.edges) {
      expect(nodeIds.has(edge.source), `edge source ${edge.source}`).toBe(true);
      expect(nodeIds.has(edge.target), `edge target ${edge.target}`).toBe(true);
    }
  });

  it("serves the fixture graph from GET /observability/neural-map", async () => {
    const manifest = await loadJson<CorpusGraphManifest>(manifestPath);
    const seed = await loadJson<CorpusGraphSeed>(seedPath);
    const expected = await loadJson<ExpectedNeuralMap>(expectedMapPath);
    const app = createServer({ initialState: buildFixtureState(seed) });

    const response = await app.inject({
      method: "GET",
      url: `/observability/neural-map?languageId=${manifest.languageId}`,
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { nodes: unknown[]; edges: unknown[]; languageId?: string };
    expect(body.nodes).toEqual(expected.nodes);
    expect(body.edges).toEqual(expected.edges);
    expect(body).not.toHaveProperty("languageId");
  });
});
