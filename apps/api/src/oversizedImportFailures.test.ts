import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { fetchUrlText, MAX_URL_CONTENT_BYTES } from "./ingestion.js";
import {
  MAX_OBSIDIAN_MARKDOWN_BYTES,
  OBSIDIAN_MARKDOWN_TOO_LARGE_REASON
} from "./routes/sources.js";
import { createServer } from "./server.js";

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

function multipartPayload(parts: Array<{
  name: string;
  filename?: string;
  contentType?: string;
  body: string;
}>, boundary: string): string {
  const chunks: string[] = [];
  for (const part of parts) {
    chunks.push(`--${boundary}`);
    if (part.filename !== undefined) {
      chunks.push(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`
      );
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

const validCorpusImportPayload = {
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
};

describe("oversized import failure examples", () => {
  const previousVaultRoots = process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;

  afterEach(() => {
    restoreEnv("ASSINI_OBSIDIAN_VAULT_ROOTS", previousVaultRoots);
  });

  it("skips Obsidian vault Markdown notes above the 1 MB import limit", async () => {
    const roots = await mkdtemp(join(tmpdir(), "assini-oversized-vault-root-"));
    const vaultPath = join(roots, "oversized-vault");
    await mkdir(vaultPath, { recursive: true });
    await writeFile(join(vaultPath, "ok.md"), "vel = water\n", "utf8");
    // One byte over the vault Markdown cap; content need not be valid UTF-8 prose.
    await writeFile(join(vaultPath, "huge.md"), Buffer.alloc(MAX_OBSIDIAN_MARKDOWN_BYTES + 1, 0x61));

    process.env.ASSINI_OBSIDIAN_VAULT_ROOTS = roots;
    const app = createServer({ initialState: buildTestWorkspaceState() });

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
    expect(response.json().summary).toMatchObject({ scanned: 2, imported: 1, skipped: 1 });
    expect(response.json().imported).toEqual([
      expect.objectContaining({
        title: "ok",
        kind: "text",
        status: "pending",
        rawText: expect.stringContaining("vel = water")
      })
    ]);
    expect(response.json().skipped).toEqual([
      {
        path: "huge.md",
        reason: OBSIDIAN_MARKDOWN_TOO_LARGE_REASON
      }
    ]);

    const listed = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/sources`,
      headers: authHeaders("reviewer-1")
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().map((source: { title: string }) => source.title)).toEqual(["ok"]);
  });

  it("rejects oversized corpus JSON imports with payloadTooLarge i18nKey", async () => {
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      bodyLimitBytes: 256
    });
    const before = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`
    });
    expect(before.statusCode).toBe(200);
    const beforeCount = before.json().length;
    const oversizedTarget = `oversized-import-${"x".repeat(400)}`;

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: {
        ...authHeaders("reviewer-1"),
        "content-type": "application/json"
      },
      payload: JSON.stringify({
        ...validCorpusImportPayload,
        textTarget: oversizedTarget,
        textTranslation: `The child walks. ${"x".repeat(400)}`
      })
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      error: "Payload too large",
      i18nKey: "errors.payloadTooLarge"
    });

    const listed = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(beforeCount);
    expect(
      listed.json().some((passage: { textTarget: string }) => passage.textTarget === oversizedTarget)
    ).toBe(false);
  });

  it("rejects oversized multipart source uploads with payloadTooLarge i18nKey", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "assini-oversized-upload-"));
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      dataDir,
      multipartFileSizeBytes: 48
    });
    const boundary = "----assini-oversized-source";
    const payload = multipartPayload([
      {
        name: "file",
        filename: "big.txt",
        contentType: "text/plain",
        body: "y".repeat(96)
      }
    ], boundary);

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

  it("rejects fetched URL source bodies above the 2 MB intake limit", async () => {
    const fetchStub = (async () => new Response("z".repeat(MAX_URL_CONTENT_BYTES + 1), {
      status: 200,
      headers: { "content-type": "text/plain" }
    })) as typeof fetch;

    const publicLookup = async () => ({ address: "93.184.216.34", family: 4 });
    await expect(
      fetchUrlText("https://example.test/huge-wordlist", fetchStub, {
        env: {},
        lookupFn: publicLookup
      })
    ).rejects.toThrow(/Source URL content is too large to process locally/);
  });
});
