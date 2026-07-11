import { describe, expect, it } from "vitest";
import {
  buildTestWorkspaceState,
  TEST_LANGUAGE_ID,
  type AppState,
  type ExtractionDraft,
  type Lexeme
} from "@assini/db";
import { computeDraftGroundingFlags } from "./draftGrounding.js";

const emptyPayload = { tags: [], morphologicalSegmentation: [], topicTags: [] };

function lexeme(form: string, gloss: string, overrides: Partial<Lexeme> = {}): Lexeme {
  return {
    id: `lex-${form}`,
    languageId: TEST_LANGUAGE_ID,
    form,
    gloss,
    partOfSpeech: "unknown",
    tags: [],
    sourceAssetIds: [],
    createdBy: "tester",
    createdAt: "2026-06-10T00:00:00.000Z",
    ...overrides
  };
}

function stateWithLexemes(lexemes: Lexeme[]): AppState {
  return { ...buildTestWorkspaceState(), lexemes };
}

function lexemeDraft(form: string, gloss: string): ExtractionDraft {
  return {
    id: `draft-${form}`,
    languageId: TEST_LANGUAGE_ID,
    sourceAssetId: "source-grounding",
    kind: "lexeme",
    payload: { ...emptyPayload, form, gloss },
    confidence: "medium",
    status: "proposed",
    createdAt: "2026-06-11T00:00:00.000Z"
  };
}

function corpusDraft(segmentation: { surface: string; lemma: string; gloss: string }[]): ExtractionDraft {
  return {
    id: "draft-corpus",
    languageId: TEST_LANGUAGE_ID,
    sourceAssetId: "source-grounding",
    kind: "corpus_passage",
    payload: {
      ...emptyPayload,
      textTarget: segmentation.map((morpheme) => morpheme.surface).join(" "),
      textTranslation: "test translation",
      morphologicalSegmentation: segmentation.map((morpheme) => ({ ...morpheme, features: [] }))
    },
    confidence: "medium",
    status: "proposed",
    createdAt: "2026-06-11T00:00:00.000Z"
  };
}

describe("computeDraftGroundingFlags", () => {
  it("returns no flags when the accepted lexicon is empty", () => {
    const flags = computeDraftGroundingFlags(lexemeDraft("talune", "swims"), stateWithLexemes([]));
    expect(flags).toEqual([]);
  });

  it("flags gloss_conflict when a lexeme draft reuses an accepted form with a different gloss", () => {
    const state = stateWithLexemes([lexeme("talu", "water")]);
    const flags = computeDraftGroundingFlags(lexemeDraft("talu", "swims"), state);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.kind).toBe("gloss_conflict");
    expect(flags[0]?.message).toContain("water");
    expect(flags[0]?.message).toContain("swims");
  });

  it("does not flag gloss_conflict when glosses match modulo case and whitespace", () => {
    const state = stateWithLexemes([lexeme("talu", "water")]);
    const flags = computeDraftGroundingFlags(lexemeDraft("talu", "  Water "), state);
    expect(flags).toEqual([]);
  });

  it("flags decomposable_form for talune when talu and ne are accepted (live-model regression)", () => {
    const state = stateWithLexemes([lexeme("talu", "water"), lexeme("ne", "locative case marker")]);
    const flags = computeDraftGroundingFlags(lexemeDraft("talune", "swims"), state);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.kind).toBe("decomposable_form");
    expect(flags[0]?.message).toContain('talu ("water")');
    expect(flags[0]?.message).toContain('ne ("locative case marker")');
  });

  it("requires full coverage of the form for decomposable_form", () => {
    const state = stateWithLexemes([lexeme("talu", "water"), lexeme("ne", "locative case marker")]);
    // "taluneX" has a trailing residue not covered by any accepted form.
    const flags = computeDraftGroundingFlags(lexemeDraft("taluneq", "swims"), state);
    expect(flags).toEqual([]);
  });

  it("does not flag decomposable_form when every segment is shorter than 3 characters", () => {
    const state = stateWithLexemes([lexeme("ne", "locative case marker"), lexeme("ka", "and")]);
    const flags = computeDraftGroundingFlags(lexemeDraft("neka", "bird"), state);
    expect(flags).toEqual([]);
  });

  it("backtracks past a greedy longest prefix that leaves uncovered residue", () => {
    const state = stateWithLexemes([
      lexeme("nukane", "long greedy prefix"),
      lexeme("nuka", "fish"),
      lexeme("nene", "again")
    ]);
    // Greedy "nukane" leaves "ne" uncovered; backtracking finds nuka + nene.
    const flags = computeDraftGroundingFlags(lexemeDraft("nukanene", "eel"), state);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.kind).toBe("decomposable_form");
    expect(flags[0]?.message).toContain('nuka ("fish")');
    expect(flags[0]?.message).toContain('nene ("again")');
  });

  it("flags segmentation_conflict when a corpus draft glosses an accepted surface differently", () => {
    const state = stateWithLexemes([lexeme("talu", "water")]);
    const draft = corpusDraft([
      { surface: "talu", lemma: "talu", gloss: "swims" },
      { surface: "mira", lemma: "mira", gloss: "river" }
    ]);
    const flags = computeDraftGroundingFlags(draft, state);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.kind).toBe("segmentation_conflict");
    expect(flags[0]?.message).toContain("talu");
    expect(flags[0]?.message).toContain("water");
  });

  it("does not flag segmentation_conflict when the segment gloss matches the accepted gloss", () => {
    const state = stateWithLexemes([lexeme("talu", "water")]);
    const draft = corpusDraft([{ surface: "talu", lemma: "talu", gloss: " WATER " }]);
    expect(computeDraftGroundingFlags(draft, state)).toEqual([]);
  });

  it("is language-scoped: lexemes from another language never produce flags", () => {
    const state = stateWithLexemes([
      lexeme("talu", "water", { languageId: "otherlang" }),
      lexeme("ne", "locative case marker", { languageId: "otherlang" })
    ]);
    expect(computeDraftGroundingFlags(lexemeDraft("talune", "swims"), state)).toEqual([]);
    expect(computeDraftGroundingFlags(lexemeDraft("talu", "swims"), state)).toEqual([]);
  });

  it("never flags grammar_note drafts", () => {
    const state = stateWithLexemes([lexeme("talu", "water")]);
    const draft: ExtractionDraft = {
      id: "draft-note",
      languageId: TEST_LANGUAGE_ID,
      sourceAssetId: "source-grounding",
      kind: "grammar_note",
      payload: { ...emptyPayload, topic: "talu", explanation: "talu means swims" },
      confidence: "medium",
      status: "proposed",
      createdAt: "2026-06-11T00:00:00.000Z"
    };
    expect(computeDraftGroundingFlags(draft, state)).toEqual([]);
  });

  it("is deterministic across repeated invocations", () => {
    const state = stateWithLexemes([
      lexeme("talu", "water"),
      lexeme("ne", "locative case marker"),
      lexeme("nuka", "fish")
    ]);
    const draft = lexemeDraft("talune", "swims");
    const first = computeDraftGroundingFlags(draft, state);
    for (let run = 0; run < 5; run += 1) {
      expect(computeDraftGroundingFlags(draft, state)).toEqual(first);
    }
  });
});
