import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("source route validation i18nKeys", () => {
  it("rejects invalid registration bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources`,
      headers: authHeaders("reviewer-1"),
      payload: { title: "incomplete" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid source body: provide kind (text|wordlist|url), title, and rawText or url",
      i18nKey: "errors.invalidSourceBody"
    });
  });

  it("rejects invalid Obsidian vault import bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-vault`,
      headers: authHeaders("reviewer-1"),
      payload: { vaultPath: "   " }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid Obsidian vault import body: provide vaultPath, includeSubfolders, and maxFiles",
      i18nKey: "errors.invalidObsidianVaultImportBody"
    });
  });

  it("rejects uploads without a multipart file with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources/upload`,
      headers: {
        ...authHeaders("reviewer-1"),
        "content-type": "multipart/form-data; boundary=----assini"
      },
      payload: "------assini--\r\n"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Upload requires a multipart file field",
      i18nKey: "errors.sourceUploadRequiresFile"
    });
  });

  it("rejects empty uploaded files with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const boundary = "----assini-empty";
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="empty.txt"',
      "Content-Type: text/plain",
      "",
      "",
      `--${boundary}--`,
      ""
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources/upload`,
      headers: {
        ...authHeaders("reviewer-1"),
        "content-type": `multipart/form-data; boundary=${boundary}`
      },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Uploaded file is empty",
      i18nKey: "errors.sourceUploadEmpty"
    });
  });

  it("returns sourceNotFound i18nKey when processing a missing source", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/sources/missing-source/process",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Source not found: missing-source",
      i18nKey: "errors.sourceNotFound"
    });
  });
});
