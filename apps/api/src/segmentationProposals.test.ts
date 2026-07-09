import { describe, expect, it } from "vitest";
import { buildTestLexemes } from "@assini/db";
import {
  enrichSegmentationFromLexicon,
  isSegmentationEmptyOrAllUnanalyzed,
  proposeLexiconSegmentation
} from "./segmentationProposals.js";

const lexemes = buildTestLexemes();

describe("isSegmentationEmptyOrAllUnanalyzed", () => {
  it("treats empty segmentation as incomplete", () => {
    expect(isSegmentationEmptyOrAllUnanalyzed([])).toBe(true);
  });

  it("treats all-unanalyzed glosses as incomplete", () => {
    expect(isSegmentationEmptyOrAllUnanalyzed([
      { gloss: "unanalyzed" },
      { gloss: "Unanalyzed" }
    ])).toBe(true);
  });

  it("keeps partially analyzed segmentation intact", () => {
    expect(isSegmentationEmptyOrAllUnanalyzed([
      { gloss: "river" },
      { gloss: "unanalyzed" }
    ])).toBe(false);
  });
});

describe("proposeLexiconSegmentation", () => {
  it("segments a known passage into lexeme-aligned morphemes", () => {
    expect(proposeLexiconSegmentation("mira talo-na", lexemes)).toEqual([
      { surface: "mira", lemma: "mira", gloss: "river", features: ["place"] },
      { surface: "talo", lemma: "talo", gloss: "walk", features: ["motion"] },
      { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] }
    ]);
  });

  it("matches longest forms first inside a hyphenated token", () => {
    expect(proposeLexiconSegmentation("saku nemi-lo-ki", lexemes)).toEqual([
      { surface: "saku", lemma: "saku", gloss: "child", features: ["person"] },
      { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["learning"] },
      { surface: "-lo", lemma: "-lo", gloss: "past tense", features: ["tense"] },
      { surface: "-ki", lemma: "-ki", gloss: "third person singular", features: ["person"] }
    ]);
  });

  it("marks unknown spans as unanalyzed while keeping known pieces", () => {
    expect(proposeLexiconSegmentation("mira noru-na", lexemes)).toEqual([
      { surface: "mira", lemma: "mira", gloss: "river", features: ["place"] },
      { surface: "noru", lemma: "noru", gloss: "unanalyzed", features: ["unanalyzed"] },
      { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] }
    ]);
  });

  it("is case-insensitive but preserves authored surface casing", () => {
    expect(proposeLexiconSegmentation("Mira TALO-na", lexemes)).toEqual([
      { surface: "Mira", lemma: "mira", gloss: "river", features: ["place"] },
      { surface: "TALO", lemma: "talo", gloss: "walk", features: ["motion"] },
      { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] }
    ]);
  });

  it("returns an empty array when no lexeme forms are known", () => {
    expect(proposeLexiconSegmentation("mira talo-na", [])).toEqual([]);
  });
});

describe("enrichSegmentationFromLexicon", () => {
  it("fills empty proposed segmentation from the lexicon", () => {
    expect(enrichSegmentationFromLexicon("mira talo-na", [], lexemes)).toEqual(
      proposeLexiconSegmentation("mira talo-na", lexemes)
    );
  });

  it("replaces all-unanalyzed fallback segmentation", () => {
    const fallback = [
      { surface: "mira", lemma: "mira", gloss: "unanalyzed", features: ["unanalyzed"] },
      { surface: "talo-na", lemma: "talo-na", gloss: "unanalyzed", features: ["unanalyzed"] }
    ];

    expect(enrichSegmentationFromLexicon("mira talo-na", fallback, lexemes)).toEqual(
      proposeLexiconSegmentation("mira talo-na", lexemes)
    );
  });

  it("does not overwrite partially analyzed segmentation", () => {
    const partial = [
      { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
      { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] }
    ];

    expect(enrichSegmentationFromLexicon("mira talo-na", partial, lexemes)).toEqual(partial);
  });
});
