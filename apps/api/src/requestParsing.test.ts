import { describe, expect, it } from "vitest";
import {
  parseLanguageCreateBody,
  parseLanguagePatchBody,
  parsePrototypeSessionBody,
  parseSourceRegistrationBody
} from "./requestParsing.js";

describe("request parsing helpers", () => {
  describe("parsePrototypeSessionBody", () => {
    it("trims a nonblank user id", () => {
      expect(parsePrototypeSessionBody({ userId: " reviewer-1 " })).toEqual({ userId: "reviewer-1" });
    });

    it("rejects blank and malformed prototype session bodies", () => {
      expect(parsePrototypeSessionBody({ userId: " " })).toBeUndefined();
      expect(parsePrototypeSessionBody({ userId: 42 })).toBeUndefined();
      expect(parsePrototypeSessionBody(null)).toBeUndefined();
    });
  });

  describe("parseLanguageCreateBody", () => {
    it("trims required language fields and defaults typology", () => {
      expect(parseLanguageCreateBody({
        name: "  River Speak ",
        description: " Documentation workspace ",
        orthography: " Lowercase Latin "
      })).toEqual({
        name: "River Speak",
        description: "Documentation workspace",
        orthography: "Lowercase Latin",
        typology: "unknown",
        phonology: undefined
      });
    });

    it("accepts a complete phonology inventory", () => {
      expect(parseLanguageCreateBody({
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
    });

    it("rejects missing required fields, invalid typology, and malformed phonology", () => {
      expect(parseLanguageCreateBody({ name: "A", description: "B", orthography: "" })).toBeUndefined();
      expect(parseLanguageCreateBody({ name: "A", description: "B", orthography: "C", typology: "nope" })).toBeUndefined();
      expect(parseLanguageCreateBody({
        name: "A",
        description: "B",
        orthography: "C",
        phonology: { consonants: ["m"], vowels: ["a"], notes: [""] }
      })).toBeUndefined();
    });
  });

  describe("parseLanguagePatchBody", () => {
    it("trims provided patch fields and accepts typology changes", () => {
      expect(parseLanguagePatchBody({
        name: "  Updated Name ",
        typology: "isolating"
      })).toEqual({
        name: "Updated Name",
        typology: "isolating"
      });
    });

    it("accepts a provided phonology patch", () => {
      expect(parseLanguagePatchBody({
        phonology: {
          consonants: [" t "],
          vowels: ["a"],
          notes: [" dental stop "]
        }
      })).toEqual({
        phonology: {
          consonants: ["t"],
          vowels: ["a"],
          notes: ["dental stop"],
          syllableTemplate: undefined,
          stress: undefined
        }
      });
    });

    it("rejects empty patches and malformed patch fields", () => {
      expect(parseLanguagePatchBody({})).toBeUndefined();
      expect(parseLanguagePatchBody({ name: " " })).toBeUndefined();
      expect(parseLanguagePatchBody({ typology: "nope" })).toBeUndefined();
      expect(parseLanguagePatchBody({ phonology: { consonants: ["m"], vowels: ["a"], notes: [""] } })).toBeUndefined();
    });
  });

  describe("parseSourceRegistrationBody", () => {
    it("parses pasted text and preserves raw text spacing", () => {
      expect(parseSourceRegistrationBody({
        kind: "wordlist",
        title: " Field notes ",
        rawText: " mira = river \n"
      })).toEqual({
        kind: "wordlist",
        title: "Field notes",
        rawText: " mira = river \n"
      });
    });

    it("parses valid http and https URL sources", () => {
      expect(parseSourceRegistrationBody({
        kind: "url",
        title: "Word list",
        url: " https://example.org/list "
      })).toEqual({
        kind: "url",
        title: "Word list",
        url: "https://example.org/list"
      });
    });

    it("rejects unsupported source kinds, blank text, and non-http URLs", () => {
      expect(parseSourceRegistrationBody({ kind: "audio", title: "Audio", rawText: "x" })).toBeUndefined();
      expect(parseSourceRegistrationBody({ kind: "text", title: "Empty", rawText: " " })).toBeUndefined();
      expect(parseSourceRegistrationBody({ kind: "url", title: "File", url: "file:///tmp/list.txt" })).toBeUndefined();
    });
  });
});
