import { describe, expect, it } from "vitest";
import {
  enrichSegmentationFromLexicon,
  proposeLexiconSegmentation,
  type LexemeSegmentationHint
} from "./segmentationProposals.js";
import { parseExtractionResponse } from "./ingestion.js";
import { parseModelJson } from "./modelJson.js";
import { redactErrorSecrets } from "./secretRedaction.js";
import { resolveOutboundHttpUrl } from "./urlSafety.js";

const PROPERTY_SEED = 0x5a17c0de;

class SeededGenerator {
  constructor(private state: number) {}

  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  integer(minimum: number, maximum: number): number {
    return minimum + (this.nextUint32() % (maximum - minimum + 1));
  }

  boolean(): boolean {
    return (this.nextUint32() & 1) === 1;
  }

  pick<T>(values: readonly T[]): T {
    return values[this.integer(0, values.length - 1)]!;
  }

  text(minimum: number, maximum: number, alphabet = 'abcXYZ019 {}[]\\"\n\t-_.:ñᐊ'): string {
    const symbols = Array.from(alphabet);
    return Array.from({ length: this.integer(minimum, maximum) }, () => this.pick(symbols)).join("");
  }
}

function counterexample(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized.length > 1_000 ? `${serialized.slice(0, 1_000)}…` : (serialized ?? String(value));
  } catch {
    return String(value);
  }
}

function checkProperty<T>(params: {
  seed: number;
  cases: number;
  generate: (generator: SeededGenerator, caseIndex: number) => T;
  verify: (value: T, caseIndex: number) => void;
}): void {
  const generator = new SeededGenerator(params.seed);
  for (let caseIndex = 0; caseIndex < params.cases; caseIndex += 1) {
    const value = params.generate(generator, caseIndex);
    try {
      params.verify(value, caseIndex);
    } catch (error) {
      throw new Error(`Property failed (seed=${params.seed}, case=${caseIndex}, value=${counterexample(value)})`, {
        cause: error
      });
    }
  }
}

async function checkAsyncProperty<T>(params: {
  seed: number;
  cases: number;
  generate: (generator: SeededGenerator, caseIndex: number) => T;
  verify: (value: T, caseIndex: number) => Promise<void>;
}): Promise<void> {
  const generator = new SeededGenerator(params.seed);
  for (let caseIndex = 0; caseIndex < params.cases; caseIndex += 1) {
    const value = params.generate(generator, caseIndex);
    try {
      await params.verify(value, caseIndex);
    } catch (error) {
      throw new Error(`Property failed (seed=${params.seed}, case=${caseIndex}, value=${counterexample(value)})`, {
        cause: error
      });
    }
  }
}

function padded(value: string): string {
  return ` ${value} `;
}

describe("deterministic security properties", () => {
  it("redacts supported credential shapes completely and idempotently", () => {
    const formats = [
      (secret: string) => `Bearer ${secret}`,
      (secret: string) => `sk-${secret}`,
      (secret: string) => `api_key=${secret}`,
      (secret: string) => `x-api-key: ${secret}`,
      (secret: string) => `access_token=${secret}`,
      (secret: string) => `https://user:${secret}@api.example/v1`
    ] as const;

    checkProperty({
      seed: PROPERTY_SEED,
      cases: 400,
      generate: (generator) => {
        const secret = generator.text(12, 48, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-");
        const message = `${generator.text(0, 20, "abc XYZ-_.:")} ${generator.pick(formats)(secret)} ${generator.text(0, 20, "abc XYZ-_.:")}`;
        return { message, secret };
      },
      verify: ({ message, secret }) => {
        const redacted = redactErrorSecrets(message);
        expect(redacted).not.toContain(secret);
        expect(redacted).toContain("[redacted-secret]");
        expect(redactErrorSecrets(redacted)).toBe(redacted);
      }
    });
  });

  it("normalizes public URLs while pinning exactly the address that passed validation", async () => {
    await checkAsyncProperty({
      seed: PROPERTY_SEED ^ 0x11111111,
      cases: 160,
      generate: (generator, caseIndex) => {
        const protocol = generator.pick(["http", "https"] as const);
        const label = `case-${caseIndex}-${generator.text(3, 12, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
        const port = generator.boolean() ? `:${generator.integer(1024, 65_535)}` : "";
        const url = `${protocol}://${label}.example${port}/a/../words?q=${generator.integer(0, 999)}#result`;
        const address = `93.184.216.${generator.integer(1, 254)}`;
        return { url, address };
      },
      verify: async ({ url, address }) => {
        const target = await resolveOutboundHttpUrl(url, {
          env: {},
          lookupFn: async () => ({ address, family: 4 })
        });
        expect(target.url.toString()).toBe(new URL(url).toString());
        expect(target.lookup).toBeTypeOf("function");

        const pinned = await new Promise<{ address: string; family: number }>((resolve, reject) => {
          target.lookup!(target.url.hostname, { all: false }, (error, resolvedAddress, family) => {
            if (error) reject(error);
            else resolve({ address: String(resolvedAddress), family: family ?? 0 });
          });
        });
        expect(pinned).toEqual({ address, family: 4 });
      }
    });
  });

  it("rejects generated addresses throughout every non-public IPv4 range", async () => {
    const privateAddress = (generator: SeededGenerator, caseIndex: number): string => {
      const tail = () => generator.integer(0, 255);
      const ranges = [
        () => `0.${tail()}.${tail()}.${tail()}`,
        () => `10.${tail()}.${tail()}.${tail()}`,
        () => `100.${generator.integer(64, 127)}.${tail()}.${tail()}`,
        () => `127.${tail()}.${tail()}.${tail()}`,
        () => `169.254.${tail()}.${tail()}`,
        () => `172.${generator.integer(16, 31)}.${tail()}.${tail()}`,
        () => `192.0.0.${tail()}`,
        () => `192.0.2.${tail()}`,
        () => `192.168.${tail()}.${tail()}`,
        () => `198.${generator.integer(18, 19)}.${tail()}.${tail()}`,
        () => `198.51.100.${tail()}`,
        () => `203.0.113.${tail()}`,
        () => `${generator.integer(224, 255)}.${tail()}.${tail()}.${tail()}`
      ];
      return ranges[caseIndex % ranges.length]!();
    };

    await checkAsyncProperty({
      seed: PROPERTY_SEED ^ 0x22222222,
      cases: 240,
      generate: (generator, caseIndex) => privateAddress(generator, caseIndex),
      verify: async (address) => {
        await expect(resolveOutboundHttpUrl(`http://${address}/metadata`, { env: {} })).rejects.toThrow(
          /private|local|blocked/i
        );
      }
    });
  });
});

describe("deterministic model-output parsing properties", () => {
  it("round-trips JSON objects through supported model prose and fence wrappers", () => {
    checkProperty({
      seed: PROPERTY_SEED ^ 0x33333333,
      cases: 500,
      generate: (generator, caseIndex) => {
        const value = {
          summary: generator.text(0, 80),
          nested: {
            caseIndex,
            enabled: generator.boolean(),
            text: generator.text(0, 80)
          },
          rows: Array.from({ length: generator.integer(0, 8) }, () => ({
            value: generator.text(0, 30),
            score: generator.integer(-1_000, 1_000)
          }))
        };
        const json = JSON.stringify(value);
        const content = generator.pick([
          () => json,
          () => `model response: ${json} end of response`,
          () => `discarded draft {not-json-${caseIndex}} final answer: ${json}`,
          () => `\`\`\`json\n${json}\n\`\`\``
        ])();
        return { content, value };
      },
      verify: ({ content, value }) => {
        expect(parseModelJson(content)).toEqual(value);
      }
    });
  });

  it("normalizes bounded extraction candidates without leaking blank or duplicate fields", () => {
    checkProperty({
      seed: PROPERTY_SEED ^ 0x44444444,
      cases: 100,
      generate: (generator) => {
        const lexemes = Array.from({ length: generator.integer(0, 115) }, (_, index) => {
          const form = generator.boolean() ? padded(`form-${index}`) : "   ";
          const gloss = generator.boolean() ? padded(`gloss-${generator.integer(0, 20)}`) : "\t";
          const tag = `tag-${generator.integer(0, 8)}`;
          return {
            form,
            gloss,
            partOfSpeech: generator.boolean() ? padded("noun") : undefined,
            tags: generator.boolean() ? [padded(tag), tag.toUpperCase(), ""] : undefined,
            confidence: generator.pick(["low", "medium", "high", "unexpected"])
          };
        });
        const passages = Array.from({ length: generator.integer(0, 115) }, (_, index) => ({
          textTarget: generator.boolean() ? padded(`target ${index}`) : " ",
          textTranslation: generator.boolean() ? padded(`translation ${index}`) : " ",
          topicTags: [" topic ", "TOPIC", ""],
          morphemes: [
            { surface: padded(`m-${index}`), lemma: " ", gloss: " ", features: [" root ", ""] },
            { surface: " ", gloss: "ignored" }
          ],
          confidence: generator.pick(["low", "medium", "high", "unexpected"])
        }));
        const grammarNotes = Array.from({ length: generator.integer(0, 115) }, (_, index) => ({
          topic: generator.boolean() ? padded(`topic-${index}`) : " ",
          explanation: generator.boolean() ? padded(`explanation-${index}`) : " ",
          confidence: generator.pick(["low", "medium", "high", "unexpected"])
        }));
        const summary = generator.boolean() ? padded(generator.text(1, 40, "abc XYZ-_.:")) : " ";
        return { lexemes, passages, grammarNotes, summary };
      },
      verify: (modelValue) => {
        const parsed = parseExtractionResponse(`\`\`\`json\n${JSON.stringify(modelValue)}\n\`\`\``);
        expect(parsed).toBeDefined();
        expect(parsed!.candidates.filter(({ kind }) => kind === "lexeme")).toHaveLength(
          modelValue.lexemes.slice(0, 100).filter(({ form, gloss }) => form.trim() && gloss.trim()).length
        );
        expect(parsed!.candidates.filter(({ kind }) => kind === "corpus_passage")).toHaveLength(
          modelValue.passages
            .slice(0, 100)
            .filter(({ textTarget, textTranslation }) => textTarget.trim() && textTranslation.trim()).length
        );
        expect(parsed!.candidates.filter(({ kind }) => kind === "grammar_note")).toHaveLength(
          modelValue.grammarNotes.slice(0, 100).filter(({ topic, explanation }) => topic.trim() && explanation.trim())
            .length
        );

        for (const candidate of parsed!.candidates) {
          expect(["low", "medium", "high"]).toContain(candidate.confidence);
          if (candidate.kind === "lexeme") {
            expect(candidate.payload.form).toBe(candidate.payload.form?.trim());
            expect(candidate.payload.gloss).toBe(candidate.payload.gloss?.trim());
            const tags = candidate.payload.tags ?? [];
            expect(tags.length).toBeGreaterThan(0);
            expect(new Set(tags.map((tag) => tag.toLowerCase())).size).toBe(tags.length);
          } else if (candidate.kind === "corpus_passage") {
            expect(candidate.payload.textTarget).toBe(candidate.payload.textTarget?.trim());
            expect(candidate.payload.textTranslation).toBe(candidate.payload.textTranslation?.trim());
            for (const morpheme of candidate.payload.morphologicalSegmentation ?? []) {
              expect(morpheme.surface).toBe(morpheme.surface.trim());
              expect(morpheme.surface).not.toBe("");
            }
          } else {
            expect(candidate.payload.topic).toBe(candidate.payload.topic?.trim());
            expect(candidate.payload.explanation).toBe(candidate.payload.explanation?.trim());
          }
        }
        expect(parsed!.summary).toBe(parsed!.summary.trim());
      }
    });
  });

  it("fails closed for type-corrupted extraction payloads without throwing", () => {
    checkProperty({
      seed: PROPERTY_SEED ^ 0x45454545,
      cases: 250,
      generate: (generator) =>
        generator.pick([
          { lexemes: "not-an-array" },
          { lexemes: [{ form: generator.integer(0, 100), gloss: "meaning" }] },
          { lexemes: [{ form: "word", gloss: { nested: true } }] },
          { passages: [{ textTarget: "words", textTranslation: ["translation"] }] },
          { passages: [{ textTarget: null, textTranslation: "translation" }] },
          { grammarNotes: [{ topic: "syntax", explanation: generator.boolean() }] },
          { grammarNotes: [{ topic: ["syntax"], explanation: "note" }] }
        ]),
      verify: (modelValue) => {
        expect(() => parseExtractionResponse(JSON.stringify(modelValue))).not.toThrow();
        expect(parseExtractionResponse(JSON.stringify(modelValue))).toBeUndefined();
      }
    });
  });
});

describe("deterministic segmentation state properties", () => {
  it("preserves every authored non-whitespace character and reaches an idempotent enrichment state", () => {
    checkProperty({
      seed: PROPERTY_SEED ^ 0x55555555,
      cases: 400,
      generate: (generator) => {
        const lexemes: LexemeSegmentationHint[] = Array.from({ length: generator.integer(1, 12) }, (_, index) => {
          const stem = generator.text(1, 6, "abcdef");
          const form = generator.boolean() ? `-${stem}` : stem;
          return {
            form,
            gloss: `gloss-${index}`,
            partOfSpeech: generator.pick(["noun", "verb", "unknown"]),
            tags: generator.boolean() ? [`feature-${index}`] : []
          };
        });
        const tokens = Array.from({ length: generator.integer(1, 8) }, () =>
          Array.from({ length: generator.integer(1, 5) }, () =>
            generator.boolean() ? generator.pick(lexemes).form : generator.text(1, 4, "uvwxyz")
          ).join(generator.pick(["", "-", "--"]))
        );
        return {
          lexemes,
          text: tokens.join(generator.pick([" ", "  ", "\n", "\t"]))
        };
      },
      verify: ({ lexemes, text }) => {
        const before = structuredClone(lexemes);
        const first = proposeLexiconSegmentation(text, lexemes);
        const second = proposeLexiconSegmentation(text, lexemes);
        expect(second).toEqual(first);
        expect(lexemes).toEqual(before);
        expect(first.every(({ surface }) => surface.length > 0)).toBe(true);
        expect(first.map(({ surface }) => surface).join("")).toBe(text.replace(/\s+/g, ""));

        const enriched = enrichSegmentationFromLexicon(text, first, lexemes);
        expect(enrichSegmentationFromLexicon(text, enriched, lexemes)).toEqual(enriched);
      }
    });
  });
});
