import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestLanguage, type SourceAsset } from "@assini/db";
import {
  extractCandidatesForAsset,
  fetchUrlText,
  heuristicExtractFromText,
  htmlToText,
  parseExtractionResponse,
  transcribeAudioFile
} from "./ingestion";
import type { LlmProvider } from "./llmProvider";

const language = buildTestLanguage();

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

    const text = await fetchUrlText("https://example.test/words", fetchStub);
    expect(text).toContain("mira = river");
  });

  it("rejects non-http URLs", async () => {
    await expect(fetchUrlText("file:///etc/passwd")).rejects.toThrow(/http or https/);
  });

  it("rejects failing responses", async () => {
    const fetchStub = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    await expect(fetchUrlText("https://example.test/missing", fetchStub)).rejects.toThrow(/status 404/);
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
      asset: makeAsset({ kind: "document", filePath: "assets/x/scan.pdf", originalName: "scan.pdf" }),
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
      fetchFn: fetchStub
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.payload.form).toBe("saku");
  });
});
