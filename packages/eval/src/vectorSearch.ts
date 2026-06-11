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
export function retrieveTopKPassagesOffline(
  query: string,
  passages: CorpusPassage[],
  k: number
): CorpusPassage[] {
  if (passages.length === 0) return [];

  const passageTexts = passages.map(
    (p) => `${p.textTarget} ${p.textTranslation} ${p.topicTags.join(" ")}`
  );

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

export async function fetchOnlineEmbeddings(
  texts: string[],
  config: { baseUrl: string; apiKey?: string; model?: string }
): Promise<number[][]> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/embeddings`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: texts,
      model: config.model || "text-embedding-3-small"
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const result = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };

  const sorted = result.data.sort((a, b) => a.index - b.index);
  return sorted.map((item) => item.embedding);
}

export async function retrieveTopKPassages(
  query: string,
  passages: CorpusPassage[],
  k: number,
  llmConfig?: { baseUrl?: string; apiKey?: string; model?: string; provider?: string }
): Promise<CorpusPassage[]> {
  if (passages.length === 0) return [];

  const provider = llmConfig?.provider?.toLowerCase();
  const isOnline =
    provider &&
    provider !== "deterministic" &&
    provider !== "off" &&
    provider !== "mock" &&
    llmConfig?.baseUrl;

  if (isOnline) {
    try {
      const passageTexts = passages.map(
        (p) => `${p.textTarget} ${p.textTranslation} ${p.topicTags.join(" ")}`
      );
      const embeddings = await fetchOnlineEmbeddings(
        [query, ...passageTexts],
        {
          baseUrl: llmConfig.baseUrl!,
          apiKey: llmConfig.apiKey,
          model: llmConfig.model
        }
      );
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
    } catch (error) {
      // Fallback silently to offline TF-IDF retrieval
    }
  }

  return retrieveTopKPassagesOffline(query, passages, k);
}
