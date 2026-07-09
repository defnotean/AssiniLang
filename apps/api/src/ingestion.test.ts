import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildTestLanguage, type SourceAsset } from "@assini/db";
import {
  extractCandidatesForAsset,
  fetchUrlText,
  heuristicExtractFromText,
  htmlToText,
  ocrImageFile,
  ocrImageWithModel,
  ocrModelConfigured,
  ocrScannedPdfFirstPage,
  parseExtractionResponse,
  splitTextIntoChunks,
  transcribeAudioFile
} from "./ingestion.js";
import type { LlmChatMessage, LlmProvider } from "./llmProvider.js";

const pdfStub = vi.hoisted(() => ({ text: "mira = river" }));
const pdfOcrStub = vi.hoisted(() => ({
  images: [] as Array<{
    data: Uint8ClampedArray;
    width: number;
    height: number;
    channels: 1 | 3 | 4;
    key: string;
  }>
}));
const docxStub = vi.hoisted(() => ({ value: "saku = child" }));
const ocrStub = vi.hoisted(() => ({
  text: "mira = river",
  error: undefined as Error | undefined,
  createWorkerCalls: 0,
  recognizedImages: [] as string[],
  terminateCalls: 0,
  lastLang: undefined as unknown,
  lastOptions: undefined as Record<string, unknown> | undefined,
  reset(text: string) {
    this.text = text;
    this.error = undefined;
    this.createWorkerCalls = 0;
    this.recognizedImages = [];
    this.terminateCalls = 0;
    this.lastLang = undefined;
    this.lastOptions = undefined;
  }
}));

vi.mock("unpdf", () => ({
  extractText: vi.fn(async () => ({ totalPages: 1, text: pdfStub.text })),
  extractImages: vi.fn(async () => pdfOcrStub.images)
}));

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(async (lang: unknown, _oem: unknown, options: Record<string, unknown> | undefined) => {
    ocrStub.createWorkerCalls += 1;
    ocrStub.lastLang = lang;
    ocrStub.lastOptions = options;
    return {
      recognize: async (image: string) => {
        ocrStub.recognizedImages.push(image);
        if (ocrStub.error) throw ocrStub.error;
        return { data: { text: ocrStub.text } };
      },
      terminate: async () => {
        ocrStub.terminateCalls += 1;
      }
    };
  })
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: docxStub.value, messages: [] }))
  }
}));

const language = buildTestLanguage();
const assetPath = (fileName: string) => `assets/${language.id}/${fileName}`;

const publicLookup = async () => ({ address: "93.184.216.34", family: 4 });
const privateLookup = async () => ({ address: "10.0.0.5", family: 4 });
const failingLookup = async (): Promise<{ address: string; family: number }> => {
  throw new Error("ENOTFOUND");
};

function makeAsset(overrides: Partial<SourceAsset>): SourceAsset {
  return {
    id: "source-1",
    languageId: language.id,
    kind: "text",
    title: "Test source",
    status: "pending",
    createdBy: "reviewer-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function providerWithChat(response: string): LlmProvider {
  return {
    name: "stub",
    async generateAssistantMessage() {
      return { content: "unused", warnings: [] };
    },
    async completeChat() {
      return response;
    }
  };
}

function providerWithChatError(error: Error): LlmProvider {
  return {
    name: "stub",
    async generateAssistantMessage() {
      return { content: "unused", warnings: [] };
    },
    async completeChat() {
      throw error;
    }
  };
}

const providerWithoutChat: LlmProvider = {
  name: "deterministic",
  async generateAssistantMessage() {
    return { content: "unused", warnings: [] };
  }
};

function providerWithChatQueue(responses: string[]): { provider: LlmProvider; calls: LlmChatMessage[][] } {
  const calls: LlmChatMessage[][] = [];
  const provider: LlmProvider = {
    name: "stub",
    async generateAssistantMessage() {
      return { content: "unused", warnings: [] };
    },
    async completeChat(messages) {
      calls.push(messages);
      return responses[Math.min(calls.length - 1, responses.length - 1)] ?? "";
    }
  };
  return { provider, calls };
}

describe("heuristicExtractFromText", () => {
  it("parses delimited word-list lines into lexeme drafts", () => {
    const result = heuristicExtractFromText("mira = river\nsaku - child\ntalo\twalk");

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.every((candidate) => candidate.kind === "lexeme")).toBe(true);
    expect(result.candidates[0]?.payload.form).toBe("mira");
    expect(result.candidates[0]?.payload.gloss).toBe("river");
    expect(result.candidates[0]?.confidence).toBe("low");
  });

  it("parses multi-word left sides into corpus passage drafts", () => {
    const result = heuristicExtractFromText("mira talo-na = I walk by the river");

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.kind).toBe("corpus_passage");
    expect(result.candidates[0]?.payload.textTarget).toBe("mira talo-na");
    expect(result.candidates[0]?.payload.textTranslation).toBe("I walk by the river");
  });

  it("ignores lines without a recognizable delimiter", () => {
    const result = heuristicExtractFromText("just some prose\nanother line");

    expect(result.candidates).toHaveLength(0);
  });
});

describe("parseExtractionResponse", () => {
  it("parses fenced JSON with all candidate kinds", () => {
    const content = [
      "Here is the extraction:",
      "```json",
      JSON.stringify({
        summary: "A short word list.",
        lexemes: [{ form: "mira", gloss: "river", partOfSpeech: "noun", tags: ["place", "place"], confidence: "high" }],
        passages: [{
          textTarget: "mira talo-na",
          textTranslation: "I walk by the river.",
          morphemes: [{ surface: "mira" }, { surface: "talo", lemma: "talo", gloss: "walk" }]
        }],
        grammarNotes: [{ topic: "syntax/order", explanation: "Subjects come first." }]
      }),
      "```"
    ].join("\n");

    const parsed = parseExtractionResponse(content);

    expect(parsed).toBeDefined();
    expect(parsed?.summary).toBe("A short word list.");
    expect(parsed?.candidates.map((candidate) => candidate.kind)).toEqual([
      "lexeme",
      "corpus_passage",
      "grammar_note"
    ]);

    const lexeme = parsed?.candidates[0];
    expect(lexeme?.payload.tags).toEqual(["place"]);
    expect(lexeme?.confidence).toBe("high");

    const passage = parsed?.candidates[1];
    expect(passage?.payload.morphologicalSegmentation).toEqual([
      { surface: "mira", lemma: "mira", gloss: "unanalyzed", features: [] },
      { surface: "talo", lemma: "talo", gloss: "walk", features: [] }
    ]);
    expect(passage?.payload.topicTags).toEqual(["imported"]);
  });

  it("finds a JSON object embedded in prose", () => {
    const parsed = parseExtractionResponse('Sure! {"summary":"x","lexemes":[{"form":"a","gloss":"b"}]} Hope that helps.');

    expect(parsed?.candidates).toHaveLength(1);
    expect(parsed?.candidates[0]?.payload.form).toBe("a");
  });

  it("returns undefined for non-JSON content", () => {
    expect(parseExtractionResponse("I could not process this.")).toBeUndefined();
  });

  it("drops candidates with blank required fields", () => {
    const parsed = parseExtractionResponse(JSON.stringify({
      lexemes: [{ form: " ", gloss: "x" }],
      passages: [{ textTarget: "a b", textTranslation: " " }],
      grammarNotes: [{ topic: "t", explanation: "explained" }]
    }));

    expect(parsed?.candidates).toHaveLength(1);
    expect(parsed?.candidates[0]?.kind).toBe("grammar_note");
  });
});

describe("htmlToText", () => {
  it("strips markup, scripts, and decodes entities", () => {
    const text = htmlToText(
      "<html><head><style>p{}</style><script>var x=1;</script></head>" +
      "<body><p>mira &amp; saku</p><div>talo&nbsp;walks</div></body></html>"
    );

    expect(text).toContain("mira & saku");
    expect(text).toContain("talo walks");
    expect(text).not.toContain("var x");
  });
});

describe("fetchUrlText", () => {
  it("extracts text from an HTML response", async () => {
    const fetchStub = (async () => new Response("<html><body><p>mira = river</p></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" }
    })) as typeof fetch;

    const text = await fetchUrlText("https://example.test/words", fetchStub, { env: {}, lookupFn: publicLookup });
    expect(text).toContain("mira = river");
  });

  it("rejects non-http URLs", async () => {
    await expect(fetchUrlText("file:///etc/passwd")).rejects.toThrow(/http or https/);
  });

  it("rejects failing responses", async () => {
    const fetchStub = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    await expect(fetchUrlText("https://example.test/missing", fetchStub, { env: {}, lookupFn: publicLookup }))
      .rejects.toThrow(/status 404/);
  });

  it("rejects private IPv4 literal URLs before fetching", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(fetchUrlText("http://192.168.1.10/words", fetchStub, { env: {} }))
      .rejects.toThrow(/private or local network/);
    await expect(fetchUrlText("http://10.0.0.1/words", fetchStub, { env: {} }))
      .rejects.toThrow(/private or local network/);
    await expect(fetchUrlText("http://169.254.169.254/latest/meta-data", fetchStub, { env: {} }))
      .rejects.toThrow(/private or local network/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("rejects localhost and loopback URLs before fetching", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(fetchUrlText("http://localhost:4321/words", fetchStub, { env: {} }))
      .rejects.toThrow(/private or local network/);
    await expect(fetchUrlText("http://127.0.0.1/words", fetchStub, { env: {} }))
      .rejects.toThrow(/private or local network/);
    await expect(fetchUrlText("http://[::1]/words", fetchStub, { env: {} }))
      .rejects.toThrow(/private or local network/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("rejects public-looking hostnames that resolve to private addresses", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(fetchUrlText("https://internal.example.com/words", fetchStub, { env: {}, lookupFn: privateLookup }))
      .rejects.toThrow(/resolves to a private or local network/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("rejects unresolvable hostnames before fetching", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(fetchUrlText("https://nowhere.example.com/words", fetchStub, { env: {}, lookupFn: failingLookup }))
      .rejects.toThrow(/could not be resolved and was blocked/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("allows private URLs when ASSINI_ALLOW_PRIVATE_URLS is set", async () => {
    const fetchStub = (async () => new Response("mira = river", {
      status: 200,
      headers: { "content-type": "text/plain" }
    })) as typeof fetch;

    const text = await fetchUrlText("http://127.0.0.1:9000/list", fetchStub, {
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" }
    });
    expect(text).toContain("mira = river");
  });
});

describe("transcribeAudioFile", () => {
  it("fails with setup guidance when no transcription endpoint is configured", async () => {
    await expect(transcribeAudioFile({
      filePath: "irrelevant.wav",
      env: {}
    })).rejects.toThrow(/ASSINI_TRANSCRIBE_BASE_URL/);
  });

  it("blocks private metadata transcription URLs when ASSINI_ALLOW_PRIVATE_URLS is off", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(transcribeAudioFile({
      filePath: "irrelevant.wav",
      env: { ASSINI_TRANSCRIBE_BASE_URL: "http://169.254.169.254/latest" },
      fetchFn: fetchStub
    })).rejects.toThrow(/private or local network/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("posts the audio file to an OpenAI-compatible transcription endpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-ingest-test-"));
    const filePath = join(dir, "clip.wav");
    await writeFile(filePath, Buffer.from([1, 2, 3, 4]));

    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetchStub = (async (url: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(url);
      requestedInit = init;
      return new Response(JSON.stringify({ text: "mira talo-na" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    const transcript = await transcribeAudioFile({
      filePath,
      mimeType: "audio/wav",
      env: {
        ASSINI_TRANSCRIBE_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_ALLOW_PRIVATE_URLS: "1"
      },
      fetchFn: fetchStub
    });

    expect(transcript).toBe("mira talo-na");
    expect(requestedUrl).toBe("http://127.0.0.1:9000/v1/audio/transcriptions");
    expect(requestedInit?.redirect).toBe("manual");
  });
});

describe("ocrModelConfigured", () => {
  it("is false when ASSINI_OCR_BASE_URL is unset", () => {
    expect(ocrModelConfigured({})).toBe(false);
  });

  it("is true for a normalized http base URL", () => {
    expect(ocrModelConfigured({ ASSINI_OCR_BASE_URL: "http://127.0.0.1:11434/v1/" })).toBe(true);
  });
});

describe("ocrImageWithModel", () => {
  it("fails with setup guidance when no OCR endpoint is configured", async () => {
    await expect(ocrImageWithModel({
      filePath: "irrelevant.png",
      env: {}
    })).rejects.toThrow(/ASSINI_OCR_BASE_URL/);
  });

  it("blocks private OCR base URLs when ASSINI_ALLOW_PRIVATE_URLS is off", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(ocrImageWithModel({
      filePath: "irrelevant.png",
      env: { ASSINI_OCR_BASE_URL: "http://169.254.169.254/latest" },
      fetchFn: fetchStub
    })).rejects.toThrow(/private or local network/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("posts the image to an OpenAI-compatible chat completions endpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-ingest-ocr-test-"));
    const filePath = join(dir, "photo.png");
    const imageBytes = Buffer.from([1, 2, 3, 4]);
    await writeFile(filePath, imageBytes);

    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    let requestedBody: Record<string, unknown> | undefined;
    const fetchStub = (async (url: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(url);
      requestedInit = init;
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ message: { content: "mira = river" } }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    const text = await ocrImageWithModel({
      filePath,
      mimeType: "image/png",
      env: {
        ASSINI_OCR_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_OCR_MODEL: "llava:13b",
        ASSINI_OCR_API_KEY: "ocr-secret",
        ASSINI_ALLOW_PRIVATE_URLS: "1"
      },
      fetchFn: fetchStub
    });

    expect(text).toBe("mira = river");
    expect(requestedUrl).toBe("http://127.0.0.1:9000/v1/chat/completions");
    expect(requestedInit?.redirect).toBe("manual");
    expect(requestedInit?.headers).toMatchObject({
      Authorization: "Bearer ocr-secret",
      "Content-Type": "application/json"
    });
    expect(requestedBody?.model).toBe("llava:13b");

    const messages = requestedBody?.messages as Array<{ role: string; content: unknown }>;
    const userContent = messages?.[0]?.content as Array<{ type: string; image_url?: { url: string } }>;
    const imagePart = userContent?.find((part) => part.type === "image_url");
    expect(imagePart?.image_url?.url).toBe(`data:image/png;base64,${imageBytes.toString("base64")}`);
  });
});

describe("extractCandidatesForAsset", () => {
  it("uses the model when completeChat is available", async () => {
    const provider = providerWithChat(JSON.stringify({
      summary: "Model extraction.",
      lexemes: [{ form: "mira", gloss: "river" }]
    }));

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: "mira = river" }),
      language,
      provider,
      dataDir: tmpdir()
    });

    expect(result.summary).toBe("Model extraction.");
    expect(result.candidates).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("falls back to heuristics with a warning when model output is not JSON", async () => {
    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: "mira = river" }),
      language,
      provider: providerWithChat("Sorry, I cannot help with that."),
      dataDir: tmpdir()
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes("fell back to offline heuristics"))).toBe(true);
  });

  it("falls back to heuristics with a warning when model extraction throws", async () => {
    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: "mira = river" }),
      language,
      provider: providerWithChatError(new Error("LLM provider returned only reasoning_content using sk-test-secret")),
      dataDir: tmpdir()
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.payload.form).toBe("mira");
    expect(result.warnings.some((warning) => warning.includes("Model extraction failed for part 1 of 1"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("fell back to offline heuristics"))).toBe(true);
    expect(JSON.stringify(result.warnings)).not.toContain("sk-test-secret");
  });

  it("uses heuristics with a warning when no model is configured", async () => {
    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: "mira = river" }),
      language,
      provider: providerWithoutChat,
      dataDir: tmpdir()
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes("deterministic mode"))).toBe(true);
  });

  it.each([
    ["parent traversal", "../outside.txt"],
    ["absolute path", undefined]
  ])("rejects unsafe persisted file paths before reading %s", async (_caseName, relativePath) => {
    const dir = await mkdtemp(join(tmpdir(), "assini-ingest-path-"));
    const outsidePath = join(dir, "outside.txt");
    await writeFile(outsidePath, "mira = river", "utf8");

    await expect(extractCandidatesForAsset({
      asset: makeAsset({
        kind: "text",
        rawText: undefined,
        filePath: relativePath ?? outsidePath
      }),
      language,
      provider: providerWithoutChat,
      dataDir: join(dir, "data")
    })).rejects.toThrow(/Unsafe source asset file path/);
  });

  it("routes image sources through local OCR when the provider has no vision support", async () => {
    ocrStub.reset("mira = river");

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ kind: "image", filePath: assetPath("img.png") }),
      language,
      provider: providerWithoutChat,
      dataDir: tmpdir()
    });

    expect(ocrStub.createWorkerCalls).toBe(1);
    expect(ocrStub.terminateCalls).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.kind).toBe("lexeme");
    expect(result.candidates[0]?.payload.form).toBe("mira");
    expect(result.warnings.some((warning) => warning.includes("used local OCR (tesseract.js)"))).toBe(true);
  });

  it("rejects unsupported document types with conversion guidance", async () => {
    await expect(extractCandidatesForAsset({
      asset: makeAsset({ kind: "document", filePath: assetPath("notes.epub"), originalName: "notes.epub" }),
      language,
      provider: providerWithoutChat,
      dataDir: tmpdir()
    })).rejects.toThrow(/not supported yet/);
  });

  it("processes URL sources through the injected fetch", async () => {
    const fetchStub = (async () => new Response("<p>saku = child</p>", {
      status: 200,
      headers: { "content-type": "text/html" }
    })) as typeof fetch;

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ kind: "url", url: "https://example.test/list", rawText: undefined }),
      language,
      provider: providerWithoutChat,
      dataDir: tmpdir(),
      fetchFn: fetchStub,
      lookupFn: publicLookup
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.payload.form).toBe("saku");
  });
});

describe("splitTextIntoChunks", () => {
  it("keeps short text as a single chunk", () => {
    expect(splitTextIntoChunks("mira = river", 100)).toEqual(["mira = river"]);
  });

  it("splits long text on line boundaries", () => {
    const lines = Array.from({ length: 10 }, (_, index) => `line-${index} = gloss-${index}`);
    const chunks = splitTextIntoChunks(lines.join("\n"), 60);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n")).toBe(lines.join("\n"));
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(60);
      for (const line of chunk.split("\n")) {
        expect(lines).toContain(line);
      }
    }
  });
});

describe("extractCandidatesForAsset chunked processing", () => {
  function longText(lineCount: number): string {
    return Array.from({ length: lineCount }, (_, index) => `word-${index} = gloss-${index} ${"x".repeat(80)}`).join("\n");
  }

  it("calls the model once per chunk and merges deduped candidates", async () => {
    const { provider, calls } = providerWithChatQueue([
      JSON.stringify({
        summary: "Part one items.",
        lexemes: [{ form: "mira", gloss: "river" }, { form: "saku", gloss: "child" }]
      }),
      JSON.stringify({
        summary: "Part two items.",
        lexemes: [{ form: "Mira", gloss: "RIVER" }, { form: "talo", gloss: "walk" }],
        grammarNotes: [{ topic: "syntax/order", explanation: "Subjects come first." }]
      })
    ]);

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: longText(160) }),
      language,
      provider,
      dataDir: tmpdir()
    });

    expect(calls).toHaveLength(2);
    const secondUserMessage = calls[1]?.find((message) => message.role === "user");
    expect(secondUserMessage?.content).toContain("part 2 of 2");

    expect(result.candidates.filter((candidate) => candidate.kind === "lexeme")).toHaveLength(3);
    expect(result.candidates.filter((candidate) => candidate.kind === "grammar_note")).toHaveLength(1);
    expect(result.summary).toContain("Part one items.");
    expect(result.summary).toContain("Part two items.");
    expect(result.warnings).toHaveLength(0);
  });

  it("processes at most 8 chunks and warns about skipped characters", async () => {
    const { provider, calls } = providerWithChatQueue([
      JSON.stringify({ summary: "Chunk.", lexemes: [{ form: "mira", gloss: "river" }] })
    ]);

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: longText(1100) }),
      language,
      provider,
      dataDir: tmpdir()
    });

    expect(calls).toHaveLength(8);
    expect(result.warnings.some((warning) => /skipped/.test(warning) && /characters/.test(warning))).toBe(true);
  });

  it("keeps single-chunk behavior unchanged, including intra-chunk duplicates", async () => {
    const { provider, calls } = providerWithChatQueue([
      JSON.stringify({
        summary: "Model extraction.",
        lexemes: [{ form: "mira", gloss: "river" }, { form: "mira", gloss: "river" }]
      })
    ]);

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: "mira = river" }),
      language,
      provider,
      dataDir: tmpdir()
    });

    expect(calls).toHaveLength(1);
    const userMessage = calls[0]?.find((message) => message.role === "user");
    expect(userMessage?.content).not.toContain("part 1");
    expect(result.summary).toBe("Model extraction.");
    expect(result.candidates).toHaveLength(2);
  });

  it("warns and continues when one chunk fails to parse", async () => {
    const { provider, calls } = providerWithChatQueue([
      JSON.stringify({ summary: "Part one items.", lexemes: [{ form: "mira", gloss: "river" }] }),
      "Sorry, I cannot help with that."
    ]);

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: longText(160) }),
      language,
      provider,
      dataDir: tmpdir()
    });

    expect(calls).toHaveLength(2);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.payload.form).toBe("mira");
    expect(result.warnings.some((warning) => warning.includes("part 2 of 2"))).toBe(true);
  });

  it("falls back to heuristics on the full text when every chunk fails to parse", async () => {
    const { provider, calls } = providerWithChatQueue(["nope", "still nope"]);

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ rawText: longText(160) }),
      language,
      provider,
      dataDir: tmpdir()
    });

    expect(calls).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes("fell back to offline heuristics"))).toBe(true);
    expect(result.candidates.length).toBe(160);
  });
});

describe("extractCandidatesForAsset document support", () => {
  async function makeDocumentAsset(fileName: string): Promise<{ asset: SourceAsset; dataDir: string }> {
    const dataDir = await mkdtemp(join(tmpdir(), "assini-ingest-doc-"));
    await mkdir(join(dataDir, "assets", language.id), { recursive: true });
    await writeFile(join(dataDir, "assets", language.id, fileName), Buffer.from([1, 2, 3, 4]));
    return {
      asset: makeAsset({ kind: "document", filePath: assetPath(fileName), originalName: fileName }),
      dataDir
    };
  }

  it("extracts text from PDF documents through the PDF parser", async () => {
    pdfStub.text = "mira = river";
    const { asset, dataDir } = await makeDocumentAsset("notes.pdf");

    const result = await extractCandidatesForAsset({
      asset,
      language,
      provider: providerWithoutChat,
      dataDir
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.payload.form).toBe("mira");
  });

  it("extracts text from DOCX documents through the DOCX parser", async () => {
    docxStub.value = "saku = child";
    const { asset, dataDir } = await makeDocumentAsset("notes.docx");

    const result = await extractCandidatesForAsset({
      asset,
      language,
      provider: providerWithoutChat,
      dataDir
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.payload.form).toBe("saku");
  });

  it("explains when a PDF has no extractable text and OCR is not configured", async () => {
    pdfStub.text = "   ";
    const { asset, dataDir } = await makeDocumentAsset("scan.pdf");

    await expect(extractCandidatesForAsset({
      asset,
      language,
      provider: providerWithoutChat,
      dataDir
    })).rejects.toThrow(/no extractable text.*ASSINI_OCR_BASE_URL/s);
  });

  it("reads scanned PDFs via OCR model when the text layer is empty", async () => {
    pdfStub.text = "   ";
    const { asset, dataDir } = await makeDocumentAsset("scan.pdf");

    const fetchStub = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "mira = river" } }]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

    pdfOcrStub.images = [{
      data: new Uint8ClampedArray([255, 0, 0, 255]),
      width: 1,
      height: 1,
      channels: 4,
      key: "page-image"
    }];

    const result = await extractCandidatesForAsset({
      asset,
      language,
      provider: providerWithoutChat,
      dataDir,
      env: {
        ASSINI_OCR_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_ALLOW_PRIVATE_URLS: "1"
      },
      fetchFn: fetchStub
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.payload.form).toBe("mira");
    expect(result.warnings.some((warning) => warning.includes("Used configured OCR model to read scanned document (page 1)."))).toBe(true);
  });

  it("surfaces OCR failures for scanned PDFs when the model cannot read page 1", async () => {
    pdfStub.text = "   ";
    pdfOcrStub.images = [{
      data: new Uint8ClampedArray([255, 0, 0, 255]),
      width: 1,
      height: 1,
      channels: 4,
      key: "page-image"
    }];
    const { asset, dataDir } = await makeDocumentAsset("scan.pdf");

    const fetchStub = (async () => new Response("down", { status: 503 })) as typeof fetch;

    await expect(extractCandidatesForAsset({
      asset,
      language,
      provider: providerWithoutChat,
      dataDir,
      env: {
        ASSINI_OCR_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_ALLOW_PRIVATE_URLS: "1"
      },
      fetchFn: fetchStub
    })).rejects.toThrow(/Configured OCR model could not read the scanned PDF:.*status 503/);
  });

  it("explains when a DOCX has no extractable text", async () => {
    docxStub.value = "";
    const { asset, dataDir } = await makeDocumentAsset("empty.docx");

    await expect(extractCandidatesForAsset({
      asset,
      language,
      provider: providerWithoutChat,
      dataDir
    })).rejects.toThrow(/no extractable text/);
  });
});

describe("ocrScannedPdfFirstPage", () => {
  it("OCRs the largest embedded image from page 1", async () => {
    pdfOcrStub.images = [
      {
        data: new Uint8ClampedArray([0, 0, 0, 255]),
        width: 1,
        height: 1,
        channels: 4,
        key: "small"
      },
      {
        data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]),
        width: 2,
        height: 2,
        channels: 4,
        key: "large"
      }
    ];

    const fetchStub = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "mira = river" } }]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

    const text = await ocrScannedPdfFirstPage({
      pdfBytes: new Uint8Array([1, 2, 3, 4]),
      env: {
        ASSINI_OCR_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_ALLOW_PRIVATE_URLS: "1"
      },
      fetchFn: fetchStub
    });

    expect(text).toBe("mira = river");
  });

  it("fails clearly when page 1 has no embedded image to OCR", async () => {
    pdfOcrStub.images = [];

    await expect(ocrScannedPdfFirstPage({
      pdfBytes: new Uint8Array([1, 2, 3, 4]),
      env: {
        ASSINI_OCR_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_ALLOW_PRIVATE_URLS: "1"
      }
    })).rejects.toThrow(/no embedded page image to OCR/);
  });
});

describe("ocrImageFile", () => {
  it("recognizes the image, terminates the worker, and returns trimmed text", async () => {
    ocrStub.reset("  mira = river  \n");

    const text = await ocrImageFile({ filePath: "C:/data/assets/x/img.png", env: {} });

    expect(text).toBe("mira = river");
    expect(ocrStub.recognizedImages).toEqual(["C:/data/assets/x/img.png"]);
    expect(ocrStub.lastLang).toBe("eng");
    expect(ocrStub.terminateCalls).toBe(1);
  });

  it("uses the OCR language from ASSINI_OCR_LANG", async () => {
    ocrStub.reset("mira = river");

    await ocrImageFile({ filePath: "img.png", env: { ASSINI_OCR_LANG: "spa" } });

    expect(ocrStub.lastLang).toBe("spa");
  });

  it("fails clearly when OCR finds no readable text", async () => {
    ocrStub.reset("   \n  ");

    await expect(ocrImageFile({ filePath: "img.png", env: {} }))
      .rejects.toThrow(/OCR found no readable text in the image/);
    expect(ocrStub.terminateCalls).toBe(1);
  });

  it("terminates the worker even when recognition fails", async () => {
    ocrStub.reset("unused");
    ocrStub.error = new Error("recognition exploded");

    await expect(ocrImageFile({ filePath: "img.png", env: {} })).rejects.toThrow(/recognition exploded/);
    expect(ocrStub.terminateCalls).toBe(1);
  });
});

describe("extractCandidatesForAsset image OCR fallback", () => {
  it("uses the configured OCR model and then text extraction when ASSINI_OCR_BASE_URL is set", async () => {
    ocrStub.reset("should not be used");
    const dataDir = await mkdtemp(join(tmpdir(), "assini-ingest-img-ocr-"));
    await mkdir(join(dataDir, "assets", language.id), { recursive: true });
    const imageBytes = Buffer.from([1, 2, 3, 4]);
    await writeFile(join(dataDir, "assets", language.id, "photo.png"), imageBytes);

    const { provider, calls } = providerWithChatQueue([
      JSON.stringify({
        summary: "Text extraction after OCR.",
        lexemes: [{ form: "mira", gloss: "river" }]
      })
    ]);

    const fetchStub = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "mira = river" } }]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ kind: "image", filePath: assetPath("photo.png"), mimeType: "image/png" }),
      language,
      provider,
      dataDir,
      env: {
        ASSINI_OCR_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_ALLOW_PRIVATE_URLS: "1"
      },
      fetchFn: fetchStub
    });

    expect(result.summary).toBe("Text extraction after OCR.");
    expect(result.candidates[0]?.payload.form).toBe("mira");
    expect(result.warnings.some((warning) => warning.includes("Used configured OCR model to read the image."))).toBe(true);
    expect(ocrStub.createWorkerCalls).toBe(0);
    expect(calls).toHaveLength(1);
    const userMessage = calls[0]?.find((message) => message.role === "user");
    expect(userMessage?.content).toContain("mira = river");
    expect(JSON.stringify(calls[0])).not.toContain("image_url");
  });

  it("prefers the vision model and never invokes OCR when completeChat exists", async () => {
    ocrStub.reset("should not be used");
    const dataDir = await mkdtemp(join(tmpdir(), "assini-ingest-img-"));
    await mkdir(join(dataDir, "assets", language.id), { recursive: true });
    await writeFile(join(dataDir, "assets", language.id, "photo.png"), Buffer.from([1, 2, 3, 4]));

    const provider = providerWithChat(JSON.stringify({
      summary: "Vision extraction.",
      lexemes: [{ form: "talo", gloss: "walk" }]
    }));

    const result = await extractCandidatesForAsset({
      asset: makeAsset({ kind: "image", filePath: assetPath("photo.png"), mimeType: "image/png" }),
      language,
      provider,
      dataDir
    });

    expect(result.summary).toBe("Vision extraction.");
    expect(result.candidates[0]?.payload.form).toBe("talo");
    expect(ocrStub.createWorkerCalls).toBe(0);
    expect(ocrStub.recognizedImages).toHaveLength(0);
  });

  it("throws an image-specific vision error when a configured model returns unparseable text", async () => {
    ocrStub.reset("should not be used");
    const dataDir = await mkdtemp(join(tmpdir(), "assini-ingest-img-"));
    await mkdir(join(dataDir, "assets", language.id), { recursive: true });
    await writeFile(join(dataDir, "assets", language.id, "photo.png"), Buffer.from([1, 2, 3, 4]));

    const attempt = extractCandidatesForAsset({
      asset: makeAsset({ kind: "image", filePath: assetPath("photo.png"), mimeType: "image/png" }),
      language,
      provider: providerWithChat("Sorry, I cannot read images."),
      dataDir
    });

    await expect(attempt).rejects.toThrow(/may not be vision-capable/);
    await attempt.catch((error: Error) => {
      expect(error.message).toContain("ASSINI_LLM_MODEL");
      expect(error.message).toContain("rely on the local OCR fallback by leaving the model unset");
    });
    expect(ocrStub.createWorkerCalls).toBe(0);
    expect(ocrStub.recognizedImages).toHaveLength(0);
  });

  it("surfaces both remedies when OCR itself fails in deterministic mode", async () => {
    ocrStub.reset("unused");
    ocrStub.error = new Error("could not decode image");

    const attempt = extractCandidatesForAsset({
      asset: makeAsset({ kind: "image", filePath: assetPath("blurry.png") }),
      language,
      provider: providerWithoutChat,
      dataDir: tmpdir()
    });

    await expect(attempt).rejects.toThrow(/ASSINI_LLM_PROVIDER/);
    await attempt.catch((error: Error) => {
      expect(error.message).toContain("could not decode image");
      expect(error.message).toContain("provide a clearer image");
    });
  });

  it("surfaces both remedies when OCR finds no text in deterministic mode", async () => {
    ocrStub.reset("   ");

    await expect(extractCandidatesForAsset({
      asset: makeAsset({ kind: "image", filePath: assetPath("blank.png") }),
      language,
      provider: providerWithoutChat,
      dataDir: tmpdir()
    })).rejects.toThrow(/OCR found no readable text in the image.*ASSINI_LLM_PROVIDER/s);
  });

  it("redacts configured OCR API keys from model OCR failure messages", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "assini-ingest-img-ocr-redact-"));
    await mkdir(join(dataDir, "assets", language.id), { recursive: true });
    await writeFile(join(dataDir, "assets", language.id, "photo.png"), Buffer.from([1, 2, 3, 4]));
    const fetchStub = (async () => {
      throw new Error("OCR model request failed for Bearer ocr-secret-value");
    }) as typeof fetch;

    const attempt = extractCandidatesForAsset({
      asset: makeAsset({ kind: "image", filePath: assetPath("photo.png"), mimeType: "image/png" }),
      language,
      provider: providerWithoutChat,
      dataDir,
      env: {
        ASSINI_OCR_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_OCR_API_KEY: "ocr-secret-value",
        ASSINI_ALLOW_PRIVATE_URLS: "1"
      },
      fetchFn: fetchStub
    });

    await expect(attempt).rejects.toThrow(/Configured OCR model could not read the image:.*\[redacted-secret\]/);
    await attempt.catch((error: Error) => {
      expect(error.message).not.toContain("ocr-secret-value");
    });
  });
});
