import type { CorpusPassage } from "@assini/db";

// Helper to tokenize and clean text
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

// Compute TF-IDF vectors for a set of texts
export function computeTfidfVectors(texts: string[]): {
  vectors: number[][];
  vectorize: (query: string) => number[];
} {
  const docsTokens = texts.map((t) => tokenize(t));
  const vocabulary = Array.from(new Set(docsTokens.flat()));
  const N = texts.length;

  // Document frequency
  const df: Record<string, number> = {};
  for (const word of vocabulary) {
    df[word] = 0;
  }
  for (const tokens of docsTokens) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      if (token in df) {
        df[token]++;
      }
    }
  }

  // IDF
  const idf: Record<string, number> = {};
  for (const word of vocabulary) {
    idf[word] = Math.log(1 + N / (1 + df[word]));
  }

  const docVectors = docsTokens.map((tokens) => {
    const tf: Record<string, number> = {};
    for (const token of tokens) {
      tf[token] = (tf[token] || 0) + 1;
    }
    return vocabulary.map((word) => (tf[word] || 0) * (idf[word] || 0));
  });

  const vectorize = (queryText: string): number[] => {
    const tokens = tokenize(queryText);
    const tf: Record<string, number> = {};
    for (const token of tokens) {
      tf[token] = (tf[token] || 0) + 1;
    }
    return vocabulary.map((word) => (tf[word] || 0) * (idf[word] || 0));
  };

  return { vectors: docVectors, vectorize };
}

// Cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Offline fallback RAG
export function retrieveTopKPassagesOffline(query: string, passages: CorpusPassage[], k: number): CorpusPassage[] {
  if (passages.length === 0) return [];

  const passageTexts = passages.map((p) => `${p.textTarget} ${p.textTranslation} ${p.topicTags.join(" ")}`);

  const { vectors, vectorize } = computeTfidfVectors(passageTexts);
  const queryVector = vectorize(query);

  const scoredPassages = passages.map((passage, index) => {
    const similarity = cosineSimilarity(queryVector, vectors[index]);
    return { passage, similarity };
  });

  // Sort descending by similarity, tie-break by ID
  scoredPassages.sort((a, b) => {
    if (Math.abs(b.similarity - a.similarity) > 1e-9) {
      return b.similarity - a.similarity;
    }
    return a.passage.id.localeCompare(b.passage.id);
  });

  return scoredPassages.slice(0, k).map((item) => item.passage);
}

export const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;
export const MAX_EMBEDDING_TIMEOUT_MS = 600_000;

export type EmbeddingFetch = typeof fetch;

export type EmbeddingSearchConfig = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: EmbeddingFetch;
};

function embeddingTimeoutMs(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return DEFAULT_EMBEDDING_TIMEOUT_MS;
  return Math.min(value as number, MAX_EMBEDDING_TIMEOUT_MS);
}

function embeddingRequestUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/embeddings`;
}

function parseEmbeddingResponse(payload: unknown, expectedCount: number): number[][] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("Embedding response data must be an array");
  }

  const data = (payload as { data: unknown[] }).data;
  if (data.length !== expectedCount) {
    throw new Error(`Embedding response count ${data.length} did not match input count ${expectedCount}`);
  }

  const embeddings: Array<number[] | undefined> = new Array(expectedCount);
  let dimension: number | undefined;
  for (const item of data) {
    if (!item || typeof item !== "object") {
      throw new Error("Embedding response item must be an object");
    }

    const { embedding, index } = item as { embedding?: unknown; index?: unknown };
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= expectedCount) {
      throw new Error("Embedding response contains an invalid index");
    }
    if (embeddings[index as number] !== undefined) {
      throw new Error("Embedding response contains a duplicate index");
    }
    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      !embedding.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      throw new Error("Embedding vectors must be non-empty and finite");
    }
    if (dimension === undefined) {
      dimension = embedding.length;
    } else if (embedding.length !== dimension) {
      throw new Error("Embedding vectors must have equal dimensions");
    }

    embeddings[index as number] = embedding as number[];
  }

  if (embeddings.some((embedding) => embedding === undefined)) {
    throw new Error("Embedding response indexes must cover every input");
  }
  return embeddings as number[][];
}

export async function fetchOnlineEmbeddings(
  texts: string[],
  config: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    timeoutMs?: number;
    fetchFn: EmbeddingFetch;
  }
): Promise<number[][]> {
  const baseUrl = config.baseUrl.trim();
  const model = config.model.trim();
  if (!baseUrl || !model) throw new Error("Embedding base URL and model are required");
  if (texts.length === 0) throw new Error("Embedding input must not be empty");

  const url = embeddingRequestUrl(baseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = config.apiKey?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const timeoutMs = embeddingTimeoutMs(config.timeoutMs);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`Embedding request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  let response: Response;
  try {
    response = await Promise.race([
      config.fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: texts, model }),
        redirect: "manual",
        signal: controller.signal
      }),
      timeoutPromise
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  return parseEmbeddingResponse(await response.json(), texts.length);
}

export async function retrieveTopKPassages(
  query: string,
  passages: CorpusPassage[],
  k: number,
  embeddingConfig?: EmbeddingSearchConfig
): Promise<CorpusPassage[]> {
  if (passages.length === 0) return [];

  const baseUrl = embeddingConfig?.baseUrl?.trim();
  const model = embeddingConfig?.model?.trim();
  // The eval package never opens a server-side network path by itself. Its API
  // caller must inject the repository's guarded outbound transport.
  const isOnline = Boolean(baseUrl && model && embeddingConfig?.fetchFn);

  if (isOnline) {
    try {
      const passageTexts = passages.map((p) => `${p.textTarget} ${p.textTranslation} ${p.topicTags.join(" ")}`);
      const embeddings = await fetchOnlineEmbeddings([query, ...passageTexts], {
        baseUrl: baseUrl!,
        model: model!,
        apiKey: embeddingConfig?.apiKey,
        timeoutMs: embeddingConfig?.timeoutMs,
        fetchFn: embeddingConfig!.fetchFn!
      });
      const queryEmbedding = embeddings[0];
      const passageEmbeddings = embeddings.slice(1);

      const scoredPassages = passages.map((passage, index) => {
        const similarity = cosineSimilarity(queryEmbedding, passageEmbeddings[index]);
        return { passage, similarity };
      });

      scoredPassages.sort((a, b) => {
        if (Math.abs(b.similarity - a.similarity) > 1e-9) {
          return b.similarity - a.similarity;
        }
        return a.passage.id.localeCompare(b.passage.id);
      });
      return scoredPassages.slice(0, k).map((item) => item.passage);
    } catch {
      // Fallback silently to offline TF-IDF retrieval
    }
  }

  return retrieveTopKPassagesOffline(query, passages, k);
}
