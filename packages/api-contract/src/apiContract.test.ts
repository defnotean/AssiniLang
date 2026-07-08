import { describe, expect, it } from "vitest";
import {
  createAiSessionPayloadSchema,
  languageCreatePayloadSchema,
  languagePatchPayloadSchema,
  sourceRegistrationPayloadSchema
} from "./apiContract.js";

describe("api contract schemas", () => {
  it("defaults omitted language typology to unknown", () => {
    expect(languageCreatePayloadSchema.parse({
      name: "  Bisaya  ",
      description: "  Cebuano test workspace  ",
      orthography: "  Latin  "
    })).toMatchObject({
      name: "Bisaya",
      description: "Cebuano test workspace",
      orthography: "Latin",
      typology: "unknown"
    });
  });

  it("defaults omitted AI session seed prompt to an empty string", () => {
    expect(createAiSessionPayloadSchema.parse({
      languageId: "bisaya",
      mode: "learner_practice"
    })).toMatchObject({
      languageId: "bisaya",
      mode: "learner_practice",
      seedPrompt: "",
      contextNoteIds: [],
      contextPassageIds: []
    });
  });

  it("trims language phonology payloads and rejects blank inventory values", () => {
    expect(languageCreatePayloadSchema.parse({
      name: "Avenik",
      description: "Practice language",
      orthography: "Latin",
      typology: "agglutinative",
      phonology: {
        consonants: [" m ", "n"],
        vowels: ["a", " i "],
        notes: [" no clusters "],
        syllableTemplate: " CV ",
        stress: " initial "
      }
    })).toMatchObject({
      typology: "agglutinative",
      phonology: {
        consonants: ["m", "n"],
        vowels: ["a", "i"],
        notes: ["no clusters"],
        syllableTemplate: "CV",
        stress: "initial"
      }
    });

    expect(languagePatchPayloadSchema.parse({ phonology: null })).toEqual({ phonology: undefined });
    expect(languageCreatePayloadSchema.safeParse({
      name: "A",
      description: "B",
      orthography: "C",
      phonology: { consonants: ["m"], vowels: ["a"], notes: [""] }
    }).success).toBe(false);
  });

  it("trims source titles and URLs without altering raw text bodies", () => {
    expect(sourceRegistrationPayloadSchema.parse({
      kind: "wordlist",
      title: " Field notes ",
      rawText: " mira = river \n"
    })).toEqual({
      kind: "wordlist",
      title: "Field notes",
      rawText: " mira = river \n"
    });

    expect(sourceRegistrationPayloadSchema.parse({
      kind: "url",
      title: "Word list",
      url: " https://example.org/list "
    })).toEqual({
      kind: "url",
      title: "Word list",
      url: "https://example.org/list"
    });

    expect(sourceRegistrationPayloadSchema.safeParse({
      kind: "url",
      title: "File",
      url: "file:///tmp/list.txt"
    }).success).toBe(false);
  });
});
