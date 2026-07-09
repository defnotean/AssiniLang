import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, createEmptyState, TEST_LANGUAGE_ID, type AppState } from "@assini/db";
import { verifyExportIntegrity } from "./publicLanguageViews.js";
import { createServer } from "./server.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

const SHA_256_HEX = /^[a-f0-9]{64}$/;

describe("export route remaining edges", () => {
  it("sets no-store headers and records a snapshot export audit receipt", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: `/exports/languages/${TEST_LANGUAGE_ID}/snapshot`,
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="assini-${TEST_LANGUAGE_ID}-snapshot.json"`
    );

    const snapshot = response.json();
    expect(snapshot.integrity.contentHash).toMatch(SHA_256_HEX);
    expect(verifyExportIntegrity(snapshot)).toBe(true);

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "language_snapshot.exported",
        entityType: "language",
        entityId: TEST_LANGUAGE_ID,
        languageId: TEST_LANGUAGE_ID,
        actorId: "reviewer-1",
        metadata: expect.objectContaining({
          exportVersion: "language-snapshot-v2",
          contentHash: snapshot.integrity.contentHash,
          algorithm: "sha256"
        })
      })
    ]));
  });

  it("sanitizes unsafe language ids in snapshot Content-Disposition filenames", async () => {
    const seeded = buildTestWorkspaceState();
    const unsafeId = "avenik/test language";
    const initialState: AppState = {
      ...seeded,
      languages: [
        ...seeded.languages,
        {
          ...seeded.languages[0],
          id: unsafeId,
          name: "Unsafe Path Language"
        }
      ]
    };
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "GET",
      url: `/exports/languages/${encodeURIComponent(unsafeId)}/snapshot`,
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="assini-avenik-test-language-snapshot.json"'
    );
    expect(response.json().language.id).toBe(unsafeId);
  });

  it("sets no-store headers and records an evaluation artifact export audit receipt", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="assini-evaluation-artifact.json"'
    );

    const artifact = response.json();
    expect(verifyExportIntegrity(artifact)).toBe(true);

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events",
      headers: authHeaders("programmer-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "evaluation_artifact.exported",
        entityType: "evaluation_run",
        entityId: "evaluation-artifact",
        languageId: null,
        actorId: "programmer-1",
        metadata: expect.objectContaining({
          exportVersion: "evaluation-artifact-v2",
          contentHash: artifact.integrity.contentHash,
          algorithm: "sha256",
          passed: artifact.summary.passed,
          languages: artifact.summary.languages,
          totalRuns: artifact.summary.totalRuns,
          failureCount: artifact.summary.failureCount
        })
      })
    ]));
  });

  it("exports empty-workspace evaluation artifacts as failed gates over HTTP", async () => {
    const app = createServer({ initialState: createEmptyState() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
    const artifact = response.json();
    expect(artifact.summary).toMatchObject({
      languages: 0,
      totalRuns: 0,
      latestRuns: 0,
      passed: false,
      failureCount: 1
    });
    expect(artifact.failureLines).toEqual([
      "No languages available to evaluate. Create a language from the sidebar first, then run System Eval."
    ]);
    expect(verifyExportIntegrity(artifact)).toBe(true);
  });

  it("exports no-run workspaces as failed evaluation artifacts over HTTP", async () => {
    const initialState: AppState = {
      ...buildTestWorkspaceState(),
      evaluationRuns: []
    };
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(200);
    const artifact = response.json();
    expect(artifact.summary).toMatchObject({
      languages: 1,
      totalRuns: 0,
      latestRuns: 0,
      passed: false,
      failureCount: 1
    });
    expect(artifact.failureLines).toEqual([
      "No evaluation runs recorded. Run System Eval before exporting an evaluation artifact."
    ]);
    expect(verifyExportIntegrity(artifact)).toBe(true);
  });

  it("does not write an audit receipt when the language snapshot is missing", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/languages/not-a-language/snapshot",
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events",
      headers: authHeaders("lead-1")
    });
    expect(audit.json().some((event: { action: string }) => event.action === "language_snapshot.exported")).toBe(false);
  });
});
