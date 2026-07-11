import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { createServer } from "./server.js";
import { MAX_SOURCE_UPLOAD_TITLE_CHARS } from "./routes/sources.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function multipartPayload(
  parts: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    body: string;
  }>,
  boundary: string
): string {
  const chunks: string[] = [];
  for (const part of parts) {
    chunks.push(`--${boundary}`);
    if (part.filename !== undefined) {
      chunks.push(`Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`);
      chunks.push(`Content-Type: ${part.contentType ?? "application/octet-stream"}`);
    } else {
      chunks.push(`Content-Disposition: form-data; name="${part.name}"`);
    }
    chunks.push("");
    chunks.push(part.body);
  }
  chunks.push(`--${boundary}--`);
  chunks.push("");
  return chunks.join("\r\n");
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
    const payload = multipartPayload(
      [{ name: "file", filename: "empty.txt", contentType: "text/plain", body: "" }],
      boundary
    );

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

  it("rejects oversized multipart uploads with payloadTooLarge i18nKey", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "assini-upload-oversize-"));
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      dataDir,
      multipartFileSizeBytes: 32
    });
    const boundary = "----assini-oversize";
    const payload = multipartPayload(
      [
        {
          name: "file",
          filename: "big.txt",
          contentType: "text/plain",
          body: "x".repeat(64)
        }
      ],
      boundary
    );

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources/upload`,
      headers: {
        ...authHeaders("reviewer-1"),
        "content-type": `multipart/form-data; boundary=${boundary}`
      },
      payload
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      error: "Payload too large",
      i18nKey: "errors.payloadTooLarge"
    });

    const listed = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/sources`,
      headers: authHeaders("reviewer-1")
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([]);
  });

  it("sanitizes traversal filenames and stores under assets/<languageId>/", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "assini-upload-path-"));
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      dataDir
    });
    const boundary = "----assini-path";
    const payload = multipartPayload(
      [
        {
          name: "title",
          body: "Safe notes"
        },
        {
          name: "file",
          filename: "../../etc/passwd.txt",
          contentType: "text/plain",
          body: "talu water"
        }
      ],
      boundary
    );

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources/upload`,
      headers: {
        ...authHeaders("reviewer-1"),
        "content-type": `multipart/form-data; boundary=${boundary}`
      },
      payload
    });

    expect(response.statusCode).toBe(201);
    const asset = response.json();
    expect(asset).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      kind: "document",
      title: "Safe notes",
      // busboy keeps only the basename; sanitizeStoredFileName then strips junk.
      originalName: "passwd.txt",
      status: "pending"
    });
    expect(asset).not.toHaveProperty("filePath");

    const relativePath = `assets/${TEST_LANGUAGE_ID}/${asset.id}__passwd.txt`;
    expect(relativePath).toMatch(new RegExp(`^assets/${TEST_LANGUAGE_ID}/source-[^/]+__passwd\\.txt$`));
    expect(relativePath).not.toContain("..");
    expect(relativePath).not.toContain("\\");
    const absolutePath = join(dataDir, ...relativePath.split("/"));
    await access(absolutePath);
    expect(await readFile(absolutePath, "utf8")).toBe("talu water");
  });

  it("rejects oversized upload titles with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const boundary = "----assini-title";
    const payload = multipartPayload(
      [
        {
          name: "title",
          body: "t".repeat(MAX_SOURCE_UPLOAD_TITLE_CHARS + 1)
        },
        {
          name: "file",
          filename: "notes.txt",
          contentType: "text/plain",
          body: "ok"
        }
      ],
      boundary
    );

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
      error: "Upload title field is too large",
      i18nKey: "errors.sourceUploadTitleTooLarge"
    });
  });

  it("rejects duplicate upload title fields with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const boundary = "----assini-title-dup";
    const payload = multipartPayload(
      [
        { name: "title", body: "First" },
        { name: "title", body: "Second" },
        {
          name: "file",
          filename: "notes.txt",
          contentType: "text/plain",
          body: "ok"
        }
      ],
      boundary
    );

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
      error: "Upload title field is invalid",
      i18nKey: "errors.sourceUploadTitleInvalid"
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
