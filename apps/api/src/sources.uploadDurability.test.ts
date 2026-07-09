import type { Dirent } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTestWorkspaceState,
  JsonStore,
  TEST_LANGUAGE_ID,
  type AppState
} from "@assini/db";
import { createServer } from "./server.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function multipartPayload(
  parts: Array<{ name: string; filename?: string; contentType?: string; body: string }>,
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
    chunks.push("", part.body);
  }
  chunks.push(`--${boundary}--`, "");
  return chunks.join("\r\n");
}

async function listFiles(root: string, relativeDirectory = ""): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(join(root, relativeDirectory), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)));
    } else {
      files.push(relativePath);
    }
  }
  return files.sort();
}

class RejectableStore extends JsonStore {
  private state: AppState;
  private rejectNext = false;

  constructor(initialState: AppState) {
    super();
    this.state = structuredClone(initialState);
  }

  rejectNextUpdate(): void {
    this.rejectNext = true;
  }

  override async read(): Promise<AppState> {
    return structuredClone(this.state);
  }

  override async update(updater: (state: AppState) => AppState): Promise<AppState> {
    const next = updater(structuredClone(this.state));
    if (this.rejectNext) {
      this.rejectNext = false;
      throw new Error("forced source upload persistence failure");
    }
    this.state = structuredClone(next);
    return structuredClone(next);
  }
}

describe("source upload durability", () => {
  it("removes staging and final files when state persistence fails", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "assini-upload-persist-failure-"));
    const store = new RejectableStore(buildTestWorkspaceState());
    const app = createServer({ store, dataDir });

    try {
      await app.ready();
      store.rejectNextUpdate();

      const boundary = "----assini-upload-persist-failure";
      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/sources/upload`,
        headers: {
          ...authHeaders("reviewer-1"),
          "content-type": `multipart/form-data; boundary=${boundary}`
        },
        payload: multipartPayload([{
          name: "file",
          filename: "notes.txt",
          contentType: "text/plain",
          body: "talu water"
        }], boundary)
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ error: "Internal Server Error" });
      expect((await store.read()).sourceAssets).toEqual([]);
      expect(await listFiles(dataDir)).toEqual([]);
    } finally {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("leaves only the finalized file after successful persistence", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "assini-upload-persist-success-"));
    const app = createServer({ initialState: buildTestWorkspaceState(), dataDir });

    try {
      const boundary = "----assini-upload-persist-success";
      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/sources/upload`,
        headers: {
          ...authHeaders("reviewer-1"),
          "content-type": `multipart/form-data; boundary=${boundary}`
        },
        payload: multipartPayload([
          { name: "title", body: "Field notes" },
          {
            name: "file",
            filename: "notes.txt",
            contentType: "text/plain",
            body: "talu water"
          }
        ], boundary)
      });

      expect(response.statusCode).toBe(201);
      const asset = response.json() as { filePath: string; title: string };
      expect(asset.title).toBe("Field notes");
      expect(await listFiles(dataDir)).toEqual([
        join("assets", TEST_LANGUAGE_ID, basename(asset.filePath))
      ]);
      expect(await readFile(join(dataDir, ...asset.filePath.split("/")), "utf8")).toBe("talu water");
    } finally {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
