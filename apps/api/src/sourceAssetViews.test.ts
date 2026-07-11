import { describe, expect, it } from "vitest";
import type { SourceAsset } from "@assini/db";
import { sourceAssetSchema } from "@assini/api-contract";
import { toPublicSourceAsset } from "./sourceAssetViews.js";

describe("source asset public projection", () => {
  it("does not expose storage paths, raw source data, URLs, or transcript content", () => {
    const persisted: SourceAsset = {
      id: "source-private",
      languageId: "language-1",
      kind: "url",
      title: "Private source",
      filePath: "assets/language-1/private.txt",
      rawText: "private raw source",
      url: "https://example.test/data?token=secret",
      transcript: "private transcript",
      status: "processed",
      createdBy: "reviewer-1",
      createdAt: "2026-01-01T00:00:00.000Z"
    };

    const projected = toPublicSourceAsset(persisted, "active");

    expect(sourceAssetSchema.parse(projected)).toEqual(projected);
    expect(projected).toMatchObject({
      id: "source-private",
      transcriptAvailable: true,
      processingQueuePhase: "active"
    });
    expect(projected).not.toHaveProperty("filePath");
    expect(projected).not.toHaveProperty("rawText");
    expect(projected).not.toHaveProperty("url");
    expect(projected).not.toHaveProperty("transcript");
  });
});
