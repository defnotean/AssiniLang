import { describe, expect, it } from "vitest";
import {
  buildTestCorpus,
  buildTestLexemes,
  buildTestNoteAnswerKeys,
  TEST_LANGUAGE_ID
} from "@assini/db";
import { scoreModelDraft, classifyModelDraftFailure, type ModelDraftScoringContext } from "./modelDraftScoring.js";

function buildContext(overrides: Partial<ModelDraftScoringContext> = {}): ModelDraftScoringContext {
  return {
    languageId: TEST_LANGUAGE_ID,
    passages: buildTestCorpus(),
    lexemes: buildTestLexemes(),
    noteAnswerKeys: buildTestNoteAnswerKeys(),
    ...overrides
  };
}

function buildGroundedDraft() {
  return {
    topic: "morphology/verb/past-suffix",
    explanation: "The suffix -lo marks past tense and precedes the person suffix.",
    examples: [
      {
        passageId: `${TEST_LANGUAGE_ID}-c002`,
        target: "saku nemi-lo-ki",
        translation: "The child taught."
      }
    ],
    evidencePassageIds: [`${TEST_LANGUAGE_ID}-c002`]
  };
}

describe("scoreModelDraft", () => {
  it("scores a fully grounded draft high with all checks passing", () => {
    const result = scoreModelDraft(buildGroundedDraft(), buildContext());

    expect(result.score).toBe(1);
    expect(result.checks.groundedEvidence.passed).toBe(true);
    expect(result.checks.knownForms.passed).toBe(true);
    expect(result.checks.topicAlignment.passed).toBe(true);
    expect(result.checks.exampleCoverage.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.failureCodes).toEqual([]);
  });

  it("detects hallucinated word forms with a named failure reason", () => {
    const draft = {
      ...buildGroundedDraft(),
      examples: [
        {
          passageId: `${TEST_LANGUAGE_ID}-c002`,
          target: "saku zorblat-lo-ki",
          translation: "The child taught."
        }
      ]
    };

    const result = scoreModelDraft(draft, buildContext());

    expect(result.checks.knownForms.passed).toBe(false);
    expect(result.failures.some((failure) => failure.includes("zorblat"))).toBe(true);
    expect(result.failureCodes).toContain("knownForms:unknown");
    expect(result.score).toBeLessThan(1);
  });

  it("flags evidence passage ids that do not resolve to a same-language passage", () => {
    const draft = {
      ...buildGroundedDraft(),
      evidencePassageIds: ["no-such-passage", `${TEST_LANGUAGE_ID}-c002`]
    };

    const result = scoreModelDraft(draft, buildContext());

    expect(result.checks.groundedEvidence.passed).toBe(false);
    expect(result.failures.some((failure) => failure.includes("no-such-passage"))).toBe(true);
    expect(result.score).toBeLessThan(1);
  });

  it("flags evidence passages that belong to a different language", () => {
    const foreignPassage = {
      ...buildTestCorpus("otherlang")[0],
      id: "otherlang-c001"
    };
    const context = buildContext({ passages: [...buildTestCorpus(), foreignPassage] });
    const draft = {
      ...buildGroundedDraft(),
      evidencePassageIds: ["otherlang-c001"]
    };

    const result = scoreModelDraft(draft, context);

    expect(result.checks.groundedEvidence.passed).toBe(false);
    expect(result.failures.some((failure) => failure.includes("otherlang-c001"))).toBe(true);
  });

  it("flags a topic that does not align with any answer-key topic", () => {
    const draft = {
      ...buildGroundedDraft(),
      topic: "phonology/clusters/exotic"
    };

    const result = scoreModelDraft(draft, buildContext());

    expect(result.checks.topicAlignment.passed).toBe(false);
    expect(result.failures.some((failure) => failure.includes("phonology/clusters/exotic"))).toBe(true);
  });

  it("passes topicAlignment by default when the language has no answer keys", () => {
    const draft = {
      ...buildGroundedDraft(),
      topic: "phonology/clusters/exotic"
    };

    const result = scoreModelDraft(draft, buildContext({ noteAnswerKeys: [] }));

    expect(result.checks.topicAlignment.passed).toBe(true);
    expect(result.checks.topicAlignment.detail).toContain("no answer keys");
  });

  it("flags drafts without examples", () => {
    const draft = {
      ...buildGroundedDraft(),
      examples: []
    };

    const result = scoreModelDraft(draft, buildContext());

    expect(result.checks.exampleCoverage.passed).toBe(false);
    expect(result.failures.some((failure) => failure.toLowerCase().includes("example"))).toBe(true);
  });

  it("flags examples whose target text does not match the referenced passage", () => {
    const draft = {
      ...buildGroundedDraft(),
      examples: [
        {
          passageId: `${TEST_LANGUAGE_ID}-c002`,
          target: "saku talo-ki",
          translation: "The child walks."
        }
      ]
    };

    const result = scoreModelDraft(draft, buildContext());

    expect(result.checks.exampleCoverage.passed).toBe(false);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const draft = buildGroundedDraft();
    const context = buildContext();
    const draftSnapshot = JSON.parse(JSON.stringify(draft));
    const contextSnapshot = JSON.parse(JSON.stringify(context));

    const first = scoreModelDraft(draft, context);
    const second = scoreModelDraft(draft, context);

    expect(second).toEqual(first);
    expect(draft).toEqual(draftSnapshot);
    expect(context).toEqual(contextSnapshot);
  });
});

describe("classifyModelDraftFailure", () => {
  it.each([
    ["groundedEvidence: draft cites no evidence passages.", "groundedEvidence:missing"],
    ['groundedEvidence: evidence passage "x" does not resolve to a passage in language "testlang".', "groundedEvidence:unresolved"],
    ['knownForms: form "zorblat" does not appear in the lexicon or corpus for language "testlang".', "knownForms:unknown"],
    ['topicAlignment: topic "phonology" does not overlap any answer-key topic.', "topicAlignment:mismatch"],
    ["exampleCoverage: draft has no examples.", "exampleCoverage:missing"],
    ['exampleCoverage: example target text does not match passage "c001".', "exampleCoverage:mismatch"],
    ["unexpected failure text", "unknown"]
  ] as const)("maps %s -> %s", (failure, code) => {
    expect(classifyModelDraftFailure(failure)).toBe(code);
  });
});
