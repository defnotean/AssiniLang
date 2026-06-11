import { describe, expect, it, vi } from "vitest";
import type { CorpusPassage } from "@assini/db";
import {
  tokenize,
  computeTfidfVectors,
  cosineSimilarity,
  retrieveTopKPassagesOffline,
  retrieveTopKPassages
} from "./vectorSearch.js";

const baseMetadata = {
  author: "local-test-author",
  year: 2026,
  license: "local-test-data",
  consentRecord: "local import consent"
};

const baseConsent = {
  use: "testing-only" as const,
  restrictions: []
};

describe("vectorSearch", () => {
  describe("tokenize", () => {
    it("lowercases and strips punctuation", () => {
      const tokens = tokenize("Hello, World! This is a test... Isn't it?");
      expect(tokens).toEqual(["hello", "world", "this", "is", "a", "test", "isnt", "it"]);
    });

    it("returns empty array for empty or whitespace string", () => {
      expect(tokenize("   ")).toEqual([]);
      expect(tokenize("")).toEqual([]);
    });
  });

  describe("cosineSimilarity", () => {
    it("calculates similarity correctly", () => {
      expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0);
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
      expect(cosineSimilarity([1, 1], [1, 0])).toBeCloseTo(Math.SQRT1_2);
    });

    it("returns 0 if one of the vectors is zero-vector", () => {
      expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
      expect(cosineSimilarity([1, 1], [0, 0])).toBe(0);
    });
  });

  describe("retrieveTopKPassagesOffline", () => {
    const passages: CorpusPassage[] = [
      {
        id: "p1",
        languageId: "lang-1",
        source: "book",
        textTarget: "saku talo-ki",
        textTranslation: "the cat slept",
        topicTags: ["cat", "sleep"],
        sourceMetadata: baseMetadata,
        morphologicalSegmentation: [],
        consentStatus: baseConsent
      },
      {
        id: "p2",
        languageId: "lang-1",
        source: "book",
        textTarget: "pilo sun-ki",
        textTranslation: "the dog ran",
        topicTags: ["dog", "run"],
        sourceMetadata: baseMetadata,
        morphologicalSegmentation: [],
        consentStatus: baseConsent
      },
      {
        id: "p3",
        languageId: "lang-1",
        source: "book",
        textTarget: "saku pilo sun-ki",
        textTranslation: "the cat and dog ran",
        topicTags: ["cat", "dog", "run"],
        sourceMetadata: baseMetadata,
        morphologicalSegmentation: [],
        consentStatus: baseConsent
      }
    ];

    it("retrieves the most relevant passages for a query", () => {
      const results = retrieveTopKPassagesOffline("cat", passages, 2);
      expect(results.length).toBe(2);
      expect(results[0].id).toBe("p1"); // Highest tag match for cat + sleep
      expect(results[1].id).toBe("p3"); // Has cat tag
    });

    it("returns empty array when passages are empty", () => {
      expect(retrieveTopKPassagesOffline("cat", [], 2)).toEqual([]);
    });
  });

  describe("retrieveTopKPassages (online and fallback)", () => {
    const passages: CorpusPassage[] = [
      {
        id: "p1",
        languageId: "lang-1",
        source: "book",
        textTarget: "saku talo-ki",
        textTranslation: "the cat slept",
        topicTags: ["cat"],
        sourceMetadata: baseMetadata,
        morphologicalSegmentation: [],
        consentStatus: baseConsent
      },
      {
        id: "p2",
        languageId: "lang-1",
        source: "book",
        textTarget: "pilo sun-ki",
        textTranslation: "the dog ran",
        topicTags: ["dog"],
        sourceMetadata: baseMetadata,
        morphologicalSegmentation: [],
        consentStatus: baseConsent
      }
    ];

    it("uses online embeddings when provider is configured", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { index: 0, embedding: [1, 0, 0] }, // query
            { index: 1, embedding: [0.9, 0.1, 0] }, // p1
            { index: 2, embedding: [0.1, 0.9, 0] } // p2
          ]
        })
      });
      vi.stubGlobal("fetch", mockFetch);

      const results = await retrieveTopKPassages(
        "cat query",
        passages,
        1,
        {
          provider: "openai",
          baseUrl: "http://localhost/v1",
          apiKey: "test-key",
          model: "text-embedding-3-small"
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("p1");

      vi.unstubAllGlobals();
    });

    it("falls back to offline TF-IDF when online embedding API throws error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("API offline"));
      vi.stubGlobal("fetch", mockFetch);

      // Should fall back to TF-IDF offline matching, which will find "cat" in p1
      const results = await retrieveTopKPassages(
        "cat",
        passages,
        1,
        {
          provider: "openai",
          baseUrl: "http://localhost/v1",
          apiKey: "test-key",
          model: "text-embedding-3-small"
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("p1");

      vi.unstubAllGlobals();
    });
  });
});
