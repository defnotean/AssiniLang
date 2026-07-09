import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("language route validation i18nKeys", () => {
  it("rejects invalid create bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/languages",
      headers: authHeaders("reviewer-1"),
      payload: { name: "   ", description: "desc", orthography: "Latin", typology: "agglutinative" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid language body: name, description, and orthography are required",
      i18nKey: "errors.invalidLanguageBody"
    });
  });

  it("rejects create bodies with an unknown typology with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/languages",
      headers: authHeaders("reviewer-1"),
      payload: {
        name: "Avenik",
        description: "Practice language",
        orthography: "Latin",
        typology: "not-a-typology"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid language body: name, description, and orthography are required",
      i18nKey: "errors.invalidLanguageBody"
    });
  });

  it("rejects invalid patch bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/languages/${TEST_LANGUAGE_ID}`,
      headers: authHeaders("reviewer-1"),
      payload: { name: "   " }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid language patch body",
      i18nKey: "errors.invalidLanguagePatchBody"
    });
  });

  it("rejects empty patch bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/languages/${TEST_LANGUAGE_ID}`,
      headers: authHeaders("reviewer-1"),
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid language patch body",
      i18nKey: "errors.invalidLanguagePatchBody"
    });
  });

  it("rejects patch bodies that only include unknown fields with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/languages/${TEST_LANGUAGE_ID}`,
      headers: authHeaders("reviewer-1"),
      payload: { unrelated: true }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid language patch body",
      i18nKey: "errors.invalidLanguagePatchBody"
    });
  });

  it("returns languageNotFound i18nKey when patching a missing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: "/languages/not-a-language",
      headers: authHeaders("reviewer-1"),
      payload: { description: "Updated description" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns languageNotFound i18nKey when deleting a missing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "DELETE",
      url: "/languages/not-a-language",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns languageNotFound i18nKey for unknown language lexicon lists", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/lexicon"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns languageNotFound i18nKey for unknown language profiles", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/profile"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });
});
