import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("corpus route validation i18nKeys", () => {
  it("returns languageNotFound i18nKey for unknown language corpus lists", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/corpus"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("rejects invalid import bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: { textTarget: "incomplete" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid corpus import body",
      i18nKey: "errors.invalidCorpusImportBody"
    });
  });

  it("returns languageNotFound i18nKey when importing for a missing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/languages/not-a-language/corpus",
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "field-notebook-2026",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "user-provided",
          consentRecord: "local import consent"
        },
        textTarget: "saku talo-ki",
        textTranslation: "The child walks.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "talo-ki", lemma: "talo", gloss: "walk.3sg", features: ["verb", "3sg"] }
        ],
        topicTags: ["motion"],
        consentStatus: {
          use: "personal-study",
          restrictions: ["local prototype import"]
        }
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns corpusImportValidationFailed i18nKey for semantic import failures", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        morphologicalSegmentation: [
          { surface: "ghost", lemma: "ghost", gloss: "ghost", features: ["noun"] }
        ],
        topicTags: ["learning"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Corpus segmentation surface is not present in target text: ghost",
      i18nKey: "errors.corpusImportValidationFailed"
    });
  });
});
