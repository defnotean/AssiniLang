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

    function embeddingResponse(data: Array<{ index: number; embedding: number[] }>): Response {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data })
      } as Response;
    }

    it("uses online embeddings only with a dedicated endpoint and model", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { index: 0, embedding: [1, 0, 0] }, // query
            { index: 1, embedding: [0.9, 0.1, 0] }, // p1
            { index: 2, embedding: [0.1, 0.9, 0] } // p2
          ]
        })
      } as Response);

      const results = await retrieveTopKPassages("cat query", passages, 1, {
        baseUrl: "http://localhost/v1",
        apiKey: "test-key",
        model: "text-embedding-3-small",
        fetchFn: mockFetch
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("p1");
    });

    it("does not call embeddings for chat-only or partially configured embedding settings", async () => {
      const mockFetch = vi.fn();

      expect(
        await retrieveTopKPassages("cat", passages, 1, {
          baseUrl: "http://localhost/v1",
          fetchFn: mockFetch
        })
      ).toEqual([passages[0]]);
      expect(
        await retrieveTopKPassages("cat", passages, 1, {
          model: "text-embedding-3-small",
          fetchFn: mockFetch
        })
      ).toEqual([passages[0]]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("falls back to offline TF-IDF when the embedding API throws", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("API offline"));

      const results = await retrieveTopKPassages("cat", passages, 1, {
        baseUrl: "http://localhost/v1",
        apiKey: "test-key",
        model: "text-embedding-3-small",
        fetchFn: mockFetch
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("p1");
    });

    it.each([
      {
        name: "a missing response item",
        data: [
          { index: 0, embedding: [1, 0] },
          { index: 1, embedding: [0.9, 0.1] }
        ]
      },
      {
        name: "duplicate indexes",
        data: [
          { index: 0, embedding: [1, 0] },
          { index: 1, embedding: [0.9, 0.1] },
          { index: 1, embedding: [0.1, 0.9] }
        ]
      },
      {
        name: "non-finite values",
        data: [
          { index: 0, embedding: [1, 0] },
          { index: 1, embedding: [Number.NaN, 0.1] },
          { index: 2, embedding: [0.1, 0.9] }
        ]
      },
      {
        name: "dimension mismatches",
        data: [
          { index: 0, embedding: [1, 0] },
          { index: 1, embedding: [0.9] },
          { index: 2, embedding: [0.1, 0.9] }
        ]
      }
    ])("falls back for $name", async ({ data }) => {
      const mockFetch = vi.fn().mockResolvedValue(embeddingResponse(data));

      const results = await retrieveTopKPassages("cat", passages, 1, {
        baseUrl: "http://localhost/v1",
        model: "text-embedding-3-small",
        fetchFn: mockFetch
      });

      expect(results).toEqual([passages[0]]);
    });

    it("bounds request time and falls back after a timeout", async () => {
      vi.useFakeTimers();
      try {
        const mockFetch = vi.fn(() => new Promise<Response>(() => undefined));
        const resultPromise = retrieveTopKPassages("cat", passages, 1, {
          baseUrl: "http://localhost/v1",
          model: "text-embedding-3-small",
          timeoutMs: 25,
          fetchFn: mockFetch
        });

        await vi.advanceTimersByTimeAsync(25);
        await expect(resultPromise).resolves.toEqual([passages[0]]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("blocks redirect following and falls back on redirect responses", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        json: async () => ({})
      } as Response);

      const results = await retrieveTopKPassages("cat", passages, 1, {
        baseUrl: "https://embeddings.example/v1",
        model: "text-embedding-3-small",
        fetchFn: mockFetch
      });

      expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
      expect(results).toEqual([passages[0]]);
    });
  });
});
