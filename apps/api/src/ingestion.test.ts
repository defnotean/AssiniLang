import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildTestLanguage, type SourceAsset } from "@assini/db";
import {
  extractCandidatesForAsset,
  fetchUrlText,
  heuristicExtractFromText,
  htmlToText,
  parseExtractionResponse,
  splitTextIntoChunks,
  transcribeAudioFile
} from "./ingestion";
import type { LlmChatMessage, LlmProvider } from "./llmProvider";

const pdfStub = vi.hoisted(() => ({ text: "mira = river" }));
const docxStub = vi.hoisted(() => ({ value: "saku = child" }));

vi.mock("unpdf", () => ({
  extractText: vi.fn(async () => ({ totalPages: 1, text: pdfStub.text }))
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: docxStub.value, messages: [] }))
  }
}));

const language = buildTestLanguage();

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

  it("lets fetch handle unresolvable hostnames instead of blocking them", async () => {
    const fetchStub = (async () => new Response("plain words", {
      status: 200,
      headers: { "content-type": "text/plain" }
    })) as typeof fetch;

    const text = await fetchUrlText("https://nowhere.example.com/words", fetchStub, { env: {}, lookupFn: failingLookup });
    expect(text).toContain("plain words");
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

  it("posts the audio file to an OpenAI-compatible transcription endpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-ingest-test-"));
    const filePath = join(dir, "clip.wav");
    await writeFile(filePath, Buffer.from([1, 2, 3, 4]));

    let requestedUrl = "";
    const fetchStub = (async (url: RequestInfo | URL) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ text: "mira talo-na" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    const transcript = await transcribeAudioFile({
      filePath,
      mimeType: "audio/wav",
      env: { ASSINI_TRANSCRIBE_BASE_URL: "http://127.0.0.1:9000/v1" },
      fetchFn: fetchStub
    });

    expect(transcript).toBe("mira talo-na");
    expect(requestedUrl).toBe("http://127.0.0.1:9000/v1/audio/transcriptions");
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

  it("rejects image sources when the provider has no vision support", async () => {
    await expect(extractCandidatesForAsset({
      asset: makeAsset({ kind: "image", filePath: "assets/x/img.png" }),
      language,
      provider: providerWithoutChat,
      dataDir: tmpdir()
    })).rejects.toThrow(/vision-capable model/);
  });

  it("rejects unsupported document types with conversion guidance", async () => {
    await expect(extractCandidatesForAsset({
      asset: makeAsset({ kind: "document", filePath: "assets/x/notes.epub", originalName: "notes.epub" }),
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
    await writeFile(join(dataDir, fileName), Buffer.from([1, 2, 3, 4]));
    return {
      asset: makeAsset({ kind: "document", filePath: fileName, originalName: fileName }),
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

  it("explains when a PDF has no extractable text", async () => {
    pdfStub.text = "   ";
    const { asset, dataDir } = await makeDocumentAsset("scan.pdf");

    await expect(extractCandidatesForAsset({
      asset,
      language,
      provider: providerWithoutChat,
      dataDir
    })).rejects.toThrow(/no extractable text/);
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
