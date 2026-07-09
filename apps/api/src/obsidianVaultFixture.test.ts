import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { createServer } from "./server.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixturesRoot = join(repoRoot, "fixtures");
const vaultPath = join(fixturesRoot, "obsidian-vault");

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("obsidian vault fixture pack", () => {
  it("imports committed fixture notes and skips empty markdown", async () => {
    const previousVaultRoots = process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
    process.env.ASSINI_OBSIDIAN_VAULT_ROOTS = fixturesRoot;

    const app = createServer({ initialState: buildTestWorkspaceState() });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-vault`,
        headers: authHeaders("reviewer-1"),
        payload: {
          vaultPath,
          includeSubfolders: true,
          maxFiles: 20
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().summary).toMatchObject({ scanned: 4, imported: 3, skipped: 1 });

      const importedTitles = response.json().imported.map((asset: { title: string }) => asset.title);
      expect(importedTitles).toEqual(
        expect.arrayContaining(["README", "Language Notes/lexicon", "Language Notes/grammar"])
      );
      expect(importedTitles).not.toContain("Language Notes/empty");

      const lexicon = response.json().imported.find(
        (asset: { title: string }) => asset.title === "Language Notes/lexicon"
      );
      expect(lexicon).toMatchObject({
        kind: "text",
        status: "pending",
        rawText: expect.stringContaining("vel = water")
      });

      expect(response.json().skipped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "Language Notes/empty.md",
            reason: "Markdown file had no importable text."
          })
        ])
      );

      const sources = await app.inject({
        method: "GET",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers: authHeaders("reviewer-1")
      });
      expect(sources.statusCode).toBe(200);
      expect(sources.json().some((source: { title: string }) => source.title === "Language Notes/lexicon")).toBe(true);
    } finally {
      restoreEnv("ASSINI_OBSIDIAN_VAULT_ROOTS", previousVaultRoots);
    }
  });
});
