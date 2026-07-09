import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { createServer } from "./server.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtureRoot = join(repoRoot, "fixtures", "bulk-sources");
const manifestPath = join(fixtureRoot, "manifest.json");

type BulkSourceExpected = {
  minDrafts: number;
  lexemeForms: string[];
  passageTargets: string[];
};

type BulkSourceEntry = {
  key: string;
  kind: "text" | "wordlist";
  title: string;
  file: string;
  expected: BulkSourceExpected;
};

type BulkSourcesManifest = {
  fixtureVersion: string;
  languageId: string;
  description: string;
  sources: BulkSourceEntry[];
};

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

async function loadManifest(): Promise<BulkSourcesManifest> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as BulkSourcesManifest;
}

async function loadSourceText(relativeFile: string): Promise<string> {
  return readFile(join(fixtureRoot, relativeFile), "utf8");
}

describe("bulk source-processing fixture pack", () => {
  it("loads the committed multi-source manifest", async () => {
    const manifest = await loadManifest();

    expect(manifest.fixtureVersion).toBe("bulk-source-processing-v1");
    expect(manifest.languageId).toBe(TEST_LANGUAGE_ID);
    expect(manifest.sources).toHaveLength(3);
    expect(manifest.sources.map((source) => source.key)).toEqual([
      "wordlist-core",
      "passages",
      "mixed"
    ]);
  });

  it("registers and processes every fixture source, asserting draft outcomes", async () => {
    const manifest = await loadManifest();
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const headers = authHeaders("reviewer-1");

    const processed: Array<{
      key: string;
      sourceId: string;
      draftCount: number;
      lexemeForms: string[];
      passageTargets: string[];
      warnings: string[];
    }> = [];

    for (const entry of manifest.sources) {
      const rawText = await loadSourceText(entry.file);
      expect(rawText.trim().length).toBeGreaterThan(0);

      const registered = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers,
        payload: {
          kind: entry.kind,
          title: entry.title,
          rawText
        }
      });
      expect(registered.statusCode, `${entry.key} register`).toBe(201);
      const sourceId = registered.json().id as string;
      expect(registered.json()).toMatchObject({
        kind: entry.kind,
        title: entry.title,
        status: "pending"
      });

      const processResponse = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers
      });
      expect(processResponse.statusCode, `${entry.key} process`).toBe(200);

      const body = processResponse.json() as {
        asset: { id: string; status: string };
        drafts: Array<{ kind: string; payload: Record<string, unknown> }>;
        warnings: string[];
      };

      expect(body.asset).toMatchObject({ id: sourceId, status: "processed" });
      expect(body.drafts.length).toBeGreaterThanOrEqual(entry.expected.minDrafts);

      const lexemeForms = body.drafts
        .filter((draft) => draft.kind === "lexeme")
        .map((draft) => String(draft.payload.form ?? ""));
      const passageTargets = body.drafts
        .filter((draft) => draft.kind === "corpus_passage")
        .map((draft) => String(draft.payload.textTarget ?? ""));

      for (const form of entry.expected.lexemeForms) {
        expect(lexemeForms, `${entry.key} lexeme ${form}`).toContain(form);
      }
      for (const target of entry.expected.passageTargets) {
        expect(passageTargets, `${entry.key} passage ${target}`).toContain(target);
      }

      expect(body.warnings.some((warning) => /offline heuristic|deterministic mode/i.test(warning))).toBe(true);

      processed.push({
        key: entry.key,
        sourceId,
        draftCount: body.drafts.length,
        lexemeForms,
        passageTargets,
        warnings: body.warnings
      });
    }

    expect(processed).toHaveLength(manifest.sources.length);
    expect(new Set(processed.map((item) => item.sourceId)).size).toBe(manifest.sources.length);

    const sources = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/sources`,
      headers
    });
    expect(sources.statusCode).toBe(200);
    const fixtureTitles = new Set(manifest.sources.map((entry) => entry.title));
    const storedFixture = (sources.json() as Array<{ id: string; title: string; status: string }>).filter(
      (source) => fixtureTitles.has(source.title)
    );
    expect(storedFixture).toHaveLength(manifest.sources.length);
    expect(storedFixture.every((source) => source.status === "processed")).toBe(true);

    const drafts = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=proposed`,
      headers
    });
    expect(drafts.statusCode).toBe(200);
    const fixtureSourceIds = new Set(processed.map((item) => item.sourceId));
    const fixtureDrafts = (
      drafts.json() as Array<{ sourceAssetId: string; kind: string; payload: Record<string, unknown> }>
    ).filter((draft) => fixtureSourceIds.has(draft.sourceAssetId));

    const totalExpectedMin = manifest.sources.reduce((sum, entry) => sum + entry.expected.minDrafts, 0);
    expect(fixtureDrafts.length).toBeGreaterThanOrEqual(totalExpectedMin);

    const allLexemeForms = fixtureDrafts
      .filter((draft) => draft.kind === "lexeme")
      .map((draft) => String(draft.payload.form ?? ""));
    const allPassageTargets = fixtureDrafts
      .filter((draft) => draft.kind === "corpus_passage")
      .map((draft) => String(draft.payload.textTarget ?? ""));

    expect(allLexemeForms).toEqual(expect.arrayContaining(["vel", "mir", "saku", "tora", "nala"]));
    expect(allPassageTargets).toEqual(
      expect.arrayContaining(["saku vel mir", "tora vel", "saku tora-na"])
    );

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("programmer-1")
    });
    expect(audit.statusCode).toBe(200);
    const actions = (audit.json() as Array<{ action: string; entityId?: string }>).map(
      (event) => event.action
    );
    expect(actions.filter((action) => action === "source_asset.process_started").length).toBeGreaterThanOrEqual(
      manifest.sources.length
    );
    expect(actions.filter((action) => action === "source_asset.processed").length).toBeGreaterThanOrEqual(
      manifest.sources.length
    );
  });
});
