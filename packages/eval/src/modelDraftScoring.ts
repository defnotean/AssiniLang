/**
 * Deterministic grounding checks for model-generated draft notes.
 *
 * `scoreModelDraft` is a pure function: it never mutates its inputs and the
 * same input always produces the same result. It is intentionally
 * conservative — it only flags things the workspace data can actually verify.
 */
import type { CorpusPassage, Lexeme, Note } from "@assini/db";

export type ModelDraftLike = {
  topic: string;
  explanation: string;
  examples: ReadonlyArray<{
    passageId?: string;
    target: string;
    translation?: string;
  }>;
  evidencePassageIds: ReadonlyArray<string>;
};

export type ModelDraftScoringContext = {
  languageId: string;
  passages: ReadonlyArray<CorpusPassage>;
  lexemes: ReadonlyArray<Lexeme>;
  noteAnswerKeys: ReadonlyArray<Note>;
};

export type ModelDraftGroundingCheck = {
  passed: boolean;
  detail: string;
};

export type ModelDraftFailureCode =
  | "groundedEvidence:missing"
  | "groundedEvidence:unresolved"
  | "knownForms:unknown"
  | "topicAlignment:mismatch"
  | "exampleCoverage:missing"
  | "exampleCoverage:mismatch"
  | "unknown";

export type ModelDraftGroundingResult = {
  score: number;
  checks: {
    groundedEvidence: ModelDraftGroundingCheck;
    knownForms: ModelDraftGroundingCheck;
    topicAlignment: ModelDraftGroundingCheck;
    exampleCoverage: ModelDraftGroundingCheck;
  };
  failures: string[];
  failureCodes: ModelDraftFailureCode[];
};

/** Maps a scored failure string to a stable taxonomy code for evaluation runs. */
export function classifyModelDraftFailure(failure: string): ModelDraftFailureCode {
  const [prefix] = failure.split(":");
  switch (prefix) {
    case "groundedEvidence":
      return failure.includes("cites no evidence") ? "groundedEvidence:missing" : "groundedEvidence:unresolved";
    case "knownForms":
      return "knownForms:unknown";
    case "topicAlignment":
      return "topicAlignment:mismatch";
    case "exampleCoverage":
      return failure.includes("no examples") ? "exampleCoverage:missing" : "exampleCoverage:mismatch";
    default:
      return "unknown";
  }
}

function failureCodesFromFailures(failures: string[]): ModelDraftFailureCode[] {
  return Array.from(new Set(failures.map(classifyModelDraftFailure)));
}

/**
 * Conservative tokenizer for target-language text: lowercases, splits on
 * whitespace and morpheme boundaries (hyphens), and strips surrounding
 * punctuation. Letters with diacritics are preserved.
 */
function tokenizeTargetText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s-]+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length > 0);
}

/** Tokenizer for topic strings: splits on any non-alphanumeric run. */
function tokenizeTopic(topic: string): string[] {
  return topic
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

function normalizeTargetForComparison(text: string): string {
  return tokenizeTargetText(text).join(" ");
}

/**
 * Scores a model-generated draft note against the language's grounded data.
 *
 * Checks:
 * - groundedEvidence: every evidencePassageIds entry resolves to a real
 *   passage belonging to the same language, and at least one is cited.
 * - knownForms: every target-language token in the draft's examples exists in
 *   the lexicon or somewhere in the language's corpus text.
 * - topicAlignment: the draft topic shares at least one token with an
 *   answer-key topic; passes by default when the language has no answer keys.
 * - exampleCoverage: the draft has at least one example, and examples that
 *   cite a resolvable passage match that passage's target text.
 *
 * Score is the fraction of checks passed (0..1).
 */
export function scoreModelDraft(
  draft: ModelDraftLike,
  context: ModelDraftScoringContext
): ModelDraftGroundingResult {
  const failures: string[] = [];

  const sameLanguagePassagesById = new Map(
    context.passages
      .filter((passage) => passage.languageId === context.languageId)
      .map((passage) => [passage.id, passage])
  );

  // groundedEvidence
  const missingEvidence = draft.evidencePassageIds.filter((id) => !sameLanguagePassagesById.has(id));
  let groundedEvidence: ModelDraftGroundingCheck;
  if (draft.evidencePassageIds.length === 0) {
    groundedEvidence = { passed: false, detail: "Draft cites no evidence passages." };
    failures.push("groundedEvidence: draft cites no evidence passages.");
  } else if (missingEvidence.length > 0) {
    groundedEvidence = {
      passed: false,
      detail: `Evidence passages not found in this language's corpus: ${missingEvidence.join(", ")}.`
    };
    for (const id of missingEvidence) {
      failures.push(`groundedEvidence: evidence passage "${id}" does not resolve to a passage in language "${context.languageId}".`);
    }
  } else {
    groundedEvidence = {
      passed: true,
      detail: `All ${draft.evidencePassageIds.length} evidence passage id(s) resolve to same-language passages.`
    };
  }

  // knownForms
  const knownTokens = new Set<string>();
  for (const lexeme of context.lexemes) {
    if (lexeme.languageId !== context.languageId) continue;
    for (const token of tokenizeTargetText(lexeme.form)) {
      knownTokens.add(token);
    }
  }
  for (const passage of sameLanguagePassagesById.values()) {
    for (const token of tokenizeTargetText(passage.textTarget)) {
      knownTokens.add(token);
    }
  }

  const unknownForms: string[] = [];
  for (const example of draft.examples) {
    for (const token of tokenizeTargetText(example.target)) {
      if (!knownTokens.has(token) && !unknownForms.includes(token)) {
        unknownForms.push(token);
      }
    }
  }
  let knownForms: ModelDraftGroundingCheck;
  if (unknownForms.length > 0) {
    knownForms = {
      passed: false,
      detail: `Example forms not found in lexicon or corpus: ${unknownForms.join(", ")}.`
    };
    for (const form of unknownForms) {
      failures.push(`knownForms: form "${form}" does not appear in the lexicon or corpus for language "${context.languageId}".`);
    }
  } else {
    knownForms = {
      passed: true,
      detail: "All target-language forms in examples exist in the lexicon or corpus."
    };
  }

  // topicAlignment
  const answerKeyTopics = context.noteAnswerKeys
    .filter((note) => note.languageId === context.languageId)
    .map((note) => note.topic);
  let topicAlignment: ModelDraftGroundingCheck;
  if (answerKeyTopics.length === 0) {
    topicAlignment = {
      passed: true,
      detail: "Language has no answer keys; topic alignment passed by default."
    };
  } else {
    const draftTopicTokens = new Set(tokenizeTopic(draft.topic));
    const aligned = answerKeyTopics.some((topic) =>
      tokenizeTopic(topic).some((token) => draftTopicTokens.has(token))
    );
    if (aligned) {
      topicAlignment = { passed: true, detail: "Topic overlaps an answer-key topic." };
    } else {
      topicAlignment = {
        passed: false,
        detail: `Topic "${draft.topic}" shares no tokens with any answer-key topic.`
      };
      failures.push(`topicAlignment: topic "${draft.topic}" does not overlap any answer-key topic.`);
    }
  }

  // exampleCoverage
  let exampleCoverage: ModelDraftGroundingCheck;
  if (draft.examples.length === 0) {
    exampleCoverage = { passed: false, detail: "Draft has no examples." };
    failures.push("exampleCoverage: draft has no examples.");
  } else {
    const mismatches: string[] = [];
    for (const example of draft.examples) {
      if (!example.passageId) continue;
      const passage = sameLanguagePassagesById.get(example.passageId);
      if (!passage) continue;
      if (normalizeTargetForComparison(example.target) !== normalizeTargetForComparison(passage.textTarget)) {
        mismatches.push(example.passageId);
      }
    }
    if (mismatches.length > 0) {
      exampleCoverage = {
        passed: false,
        detail: `Example target text does not match the cited passage(s): ${mismatches.join(", ")}.`
      };
      for (const id of mismatches) {
        failures.push(`exampleCoverage: example target text does not match passage "${id}".`);
      }
    } else {
      exampleCoverage = {
        passed: true,
        detail: "Draft has examples and checkable examples match their cited passages."
      };
    }
  }

  const checks = { groundedEvidence, knownForms, topicAlignment, exampleCoverage };
  const passedCount = Object.values(checks).filter((check) => check.passed).length;

  return {
    score: passedCount / Object.values(checks).length,
    checks,
    failures,
    failureCodes: failureCodesFromFailures(failures)
  };
}
