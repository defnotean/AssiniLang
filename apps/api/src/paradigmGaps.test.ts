import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import type { AppState } from "@assini/db";
import { detectParadigmGaps, PARADIGM_GAP_REPORT_LIMIT } from "./paradigmGaps.js";

type Passage = AppState["corpus"][number];
type Morpheme = Passage["morphologicalSegmentation"][number];

function makePassage(
  base: Passage,
  id: string,
  languageId: string,
  segmentation: Morpheme[]
): Passage {
  return {
    ...base,
    id,
    languageId,
    morphologicalSegmentation: segmentation
  };
}

function free(lemma: string, gloss: string): Morpheme {
  return { surface: lemma, lemma, gloss, features: ["root"] };
}

function suffix(lemma: string, gloss: string, features: string[]): Morpheme {
  return { surface: lemma, lemma, gloss, features };
}

function stateWithCorpus(corpus: Passage[]): AppState {
  const state = buildTestWorkspaceState();
  return { ...state, corpus };
}

describe("paradigm gap detection", () => {
  const base = buildTestWorkspaceState().corpus[0];

  it("reports a missing cell when a lemma attests >=2 cells along a dimension", () => {
    const state = stateWithCorpus([
      makePassage(base, "p1", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-na", "1sg", ["person"])]),
      makePassage(base, "p2", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-ki", "3sg", ["person"])]),
      makePassage(base, "p3", TEST_LANGUAGE_ID, [free("nemi", "teach"), suffix("-su", "2sg", ["person"])]),
      makePassage(base, "p4", TEST_LANGUAGE_ID, [free("nemi", "teach"), suffix("-ki", "3sg", ["person"])])
    ]);

    const gaps = detectParadigmGaps(state, TEST_LANGUAGE_ID);

    expect(gaps).toEqual([
      {
        lemma: "nemi",
        dimension: "person",
        attested: ["2sg", "3sg"],
        missing: ["1sg"],
        evidencePassageIds: ["p3", "p4"]
      },
      {
        lemma: "talo",
        dimension: "person",
        attested: ["1sg", "3sg"],
        missing: ["2sg"],
        evidencePassageIds: ["p1", "p2"]
      }
    ]);
  });

  it("attaches prefixes to the following free morpheme", () => {
    const state = stateWithCorpus([
      makePassage(base, "p1", TEST_LANGUAGE_ID, [suffix("ta-", "PST", ["tense"]), free("talo", "walk")]),
      makePassage(base, "p2", TEST_LANGUAGE_ID, [suffix("ne-", "FUT", ["tense"]), free("talo", "walk")]),
      makePassage(base, "p3", TEST_LANGUAGE_ID, [suffix("ro-", "PRS", ["tense"]), free("nemi", "teach")])
    ]);

    const gaps = detectParadigmGaps(state, TEST_LANGUAGE_ID);

    expect(gaps).toEqual([
      {
        lemma: "talo",
        dimension: "tense",
        attested: ["FUT", "PST"],
        missing: ["PRS"],
        evidencePassageIds: ["p1", "p2"]
      }
    ]);
  });

  it("infers no paradigm when fewer than two cells are attested for a lemma", () => {
    const state = stateWithCorpus([
      makePassage(base, "p1", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-na", "1sg", ["person"])]),
      makePassage(base, "p2", TEST_LANGUAGE_ID, [free("nemi", "teach"), suffix("-ki", "3sg", ["person"])]),
      makePassage(base, "p3", TEST_LANGUAGE_ID, [free("saku", "child"), suffix("-su", "2sg", ["person"])])
    ]);

    expect(detectParadigmGaps(state, TEST_LANGUAGE_ID)).toEqual([]);
  });

  it("derives expected value sets only from the language's own data", () => {
    const state = stateWithCorpus([
      makePassage(base, "p1", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-na", "1sg", ["person"])]),
      makePassage(base, "p2", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-ki", "3sg", ["person"])]),
      // 2sg only exists in another language, so it must never be "expected" here.
      makePassage(base, "x1", "otherlang", [free("talo", "walk"), suffix("-su", "2sg", ["person"])])
    ]);

    expect(detectParadigmGaps(state, TEST_LANGUAGE_ID)).toEqual([]);
  });

  it("normalizes common tense and person gloss aliases before comparing cells", () => {
    const state = stateWithCorpus([
      makePassage(base, "p1", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-mi", "present", ["tense"])]),
      makePassage(base, "p2", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-lo", "past tense", ["tense"])]),
      makePassage(base, "p3", TEST_LANGUAGE_ID, [free("nemi", "teach"), suffix("-mi", "present tense", ["tense"])]),
      makePassage(base, "p4", TEST_LANGUAGE_ID, [free("nemi", "teach"), suffix("-lo", "past", ["tense"])]),
      makePassage(base, "p5", TEST_LANGUAGE_ID, [free("kora", "speak"), suffix("-na", "first person singular", ["person"])]),
      makePassage(base, "p6", TEST_LANGUAGE_ID, [free("kora", "speak"), suffix("-ki", "3sg", ["person"])]),
      makePassage(base, "p7", TEST_LANGUAGE_ID, [free("sora", "see"), suffix("-na", "1sg", ["person"])]),
      makePassage(base, "p8", TEST_LANGUAGE_ID, [free("sora", "see"), suffix("-ki", "third person singular", ["person"])])
    ]);

    expect(detectParadigmGaps(state, TEST_LANGUAGE_ID)).toEqual([]);
  });

  it("isolates evidence and gaps per language", () => {
    const sharedCorpus = [
      makePassage(base, "p1", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-na", "1sg", ["person"])]),
      makePassage(base, "p2", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-ki", "3sg", ["person"])]),
      makePassage(base, "p3", TEST_LANGUAGE_ID, [free("nemi", "teach"), suffix("-su", "2sg", ["person"])]),
      makePassage(base, "x1", "otherlang", [free("talo", "walk"), suffix("-zu", "4sg", ["person"])])
    ];
    const state = stateWithCorpus(sharedCorpus);

    const gaps = detectParadigmGaps(state, TEST_LANGUAGE_ID);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ lemma: "talo", missing: ["2sg"] });
    expect(gaps[0].missing).not.toContain("4sg");
    expect(gaps[0].evidencePassageIds).not.toContain("x1");

    const otherGaps = detectParadigmGaps(state, "otherlang");
    expect(otherGaps).toEqual([]);
  });

  it("caps the report at 20 entries ordered by most attested cells first", () => {
    const corpus: Passage[] = [];
    // A language-wide person dimension with three values; "big" lemma attests
    // three of four values, the numbered lemmas attest two each.
    const values: Array<[string, string]> = [["-na", "1sg"], ["-ki", "3sg"], ["-su", "2sg"], ["-zu", "4sg"]];
    for (const [form, gloss] of values) {
      corpus.push(makePassage(base, `seed-${gloss}`, TEST_LANGUAGE_ID, [free("seedmost", "seed"), suffix(form, gloss, ["person"])]));
    }
    for (const [form, gloss] of values.slice(0, 3)) {
      corpus.push(makePassage(base, `big-${gloss}`, TEST_LANGUAGE_ID, [free("big", "big"), suffix(form, gloss, ["person"])]));
    }
    for (let i = 0; i < 25; i += 1) {
      const lemma = `lemma${String(i).padStart(2, "0")}`;
      for (const [form, gloss] of values.slice(0, 2)) {
        corpus.push(makePassage(base, `${lemma}-${gloss}`, TEST_LANGUAGE_ID, [free(lemma, lemma), suffix(form, gloss, ["person"])]));
      }
    }

    const gaps = detectParadigmGaps(stateWithCorpus(corpus), TEST_LANGUAGE_ID);

    expect(gaps).toHaveLength(20);
    expect(gaps[0]).toMatchObject({ lemma: "big", attested: ["1sg", "2sg", "3sg"], missing: ["4sg"] });
    expect(gaps.slice(1).every((gap) => gap.attested.length === 2)).toBe(true);
    expect(gaps.slice(1).map((gap) => gap.lemma)).toEqual(
      gaps.slice(1).map((gap) => gap.lemma).slice().sort()
    );
  });

  it("exposes the report limit constant", () => {
    expect(PARADIGM_GAP_REPORT_LIMIT).toBe(20);
  });

  it("is deterministic regardless of passage ordering", () => {
    const corpus = [
      makePassage(base, "p1", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-na", "1sg", ["person"])]),
      makePassage(base, "p2", TEST_LANGUAGE_ID, [free("talo", "walk"), suffix("-ki", "3sg", ["person"])]),
      makePassage(base, "p3", TEST_LANGUAGE_ID, [free("nemi", "teach"), suffix("-su", "2sg", ["person"])]),
      makePassage(base, "p4", TEST_LANGUAGE_ID, [free("nemi", "teach"), suffix("-ki", "3sg", ["person"])])
    ];

    const forward = detectParadigmGaps(stateWithCorpus(corpus), TEST_LANGUAGE_ID);
    const reversed = detectParadigmGaps(stateWithCorpus([...corpus].reverse()), TEST_LANGUAGE_ID);
    const repeat = detectParadigmGaps(stateWithCorpus(corpus), TEST_LANGUAGE_ID);

    expect(reversed).toEqual(forward);
    expect(repeat).toEqual(forward);
  });
});
