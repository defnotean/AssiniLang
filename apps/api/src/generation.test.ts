import { describe, expect, it } from "vitest";
import {
  buildTestCorpus,
  buildTestLanguage,
  buildTestLexemes,
  buildTestNoteAnswerKeys,
  TEST_LANGUAGE_ID
} from "@assini/db";
import {
  buildExerciseGenerationMessages,
  buildNoteGenerationMessages,
  generateModelDraftNotes,
  generateModelExercise,
  ModelRequiredError,
  parseGeneratedExercise,
  parseGeneratedNotes,
  type ExerciseGrounding,
  type NoteGrounding
} from "./generation.js";
import type { LlmChatMessage, LlmProvider } from "./llmProvider.js";

const language = buildTestLanguage();
const corpus = buildTestCorpus();
const lexemes = buildTestLexemes();
const notes = buildTestNoteAnswerKeys();

function noteGrounding(): NoteGrounding {
  return {
    passageIds: new Set(corpus.map((passage) => passage.id)),
    noteTopics: new Set(notes.map((note) => note.topic))
  };
}

function exerciseGrounding(): ExerciseGrounding {
  return {
    lexemeForms: new Set(lexemes.map((lexeme) => lexeme.form.toLowerCase())),
    noteIds: new Set(notes.map((note) => note.id))
  };
}

function providerWithChat(response: string): { provider: LlmProvider; calls: LlmChatMessage[][] } {
  const calls: LlmChatMessage[][] = [];
  const provider: LlmProvider = {
    name: "stub",
    async generateAssistantMessage() {
      return { content: "unused", warnings: [] };
    },
    async completeChat(messages) {
      calls.push(messages);
      return response;
    }
  };
  return { provider, calls };
}

const providerWithoutChat: LlmProvider = {
  name: "deterministic",
  async generateAssistantMessage() {
    return { content: "unused", warnings: [] };
  }
};

describe("buildNoteGenerationMessages", () => {
  it("includes the language description, corpus ids, lexicon, and existing topics, and stays bounded", () => {
    const messages = buildNoteGenerationMessages(language, { corpus, lexemes, notes });
    const user = messages.find((message) => message.role === "user");
    const userContent = typeof user?.content === "string" ? user.content : "";
    const systemContent = typeof messages[0]?.content === "string" ? messages[0].content : "";

    expect(systemContent).toContain(language.name);
    expect(systemContent).toContain("evidencePassageIds");
    expect(userContent).toContain(`${TEST_LANGUAGE_ID}-c001`);
    expect(userContent).toContain("mira");
    expect(userContent).toContain("syntax/basic-order");
    expect(userContent.length).toBeLessThanOrEqual(12_000 + 64);
  });
});

describe("buildExerciseGenerationMessages", () => {
  it("requests a specific type when provided and lists the lexicon", () => {
    const messages = buildExerciseGenerationMessages(language, { corpus, lexemes, notes }, { type: "segment" });
    const systemContent = typeof messages[0]?.content === "string" ? messages[0].content : "";

    expect(systemContent).toContain('type "segment"');
    expect(systemContent).toContain("allowedVocabulary");
  });
});

describe("parseGeneratedNotes", () => {
  it("keeps a well-grounded note and drops an ungrounded one with a warning", () => {
    const content = JSON.stringify({
      notes: [
        {
          topic: "morphology/person/first-singular",
          explanation: "The suffix -na marks a first-person singular subject on the verb.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-c001`],
          confidence: "high"
        },
        {
          topic: "phonology/invented",
          explanation: "This claims a pattern with no real supporting passage in the corpus.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-does-not-exist`],
          confidence: "low"
        }
      ]
    });

    const result = parseGeneratedNotes(content, noteGrounding());

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]?.topic).toBe("morphology/person/first-singular");
    expect(result.notes[0]?.evidencePassageIds).toEqual([`${TEST_LANGUAGE_ID}-c001`]);
    expect(result.warnings.some((warning) => warning.includes("ungrounded") && warning.includes("phonology/invented"))).toBe(true);
  });

  it("dedupes against an existing note topic and within the batch", () => {
    const content = JSON.stringify({
      notes: [
        {
          // duplicates the existing approved note topic
          topic: "syntax/basic-order",
          explanation: "Subjects come before verbs in basic clauses, restating the known rule.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-c001`]
        },
        {
          topic: "morphology/person/third-singular",
          explanation: "The suffix -ki marks a third-person singular subject on the verb.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-c003`]
        },
        {
          // duplicates the second note within this same batch (case/space variant)
          topic: "Morphology/Person/Third-Singular ",
          explanation: "The suffix -ki marks a third-person singular subject, duplicated within the batch.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-c002`]
        }
      ]
    });

    const result = parseGeneratedNotes(content, noteGrounding());

    expect(result.notes.map((note) => note.topic)).toEqual(["morphology/person/third-singular"]);
    expect(result.warnings.filter((warning) => warning.includes("duplicates"))).toHaveLength(2);
  });

  it("drops notes with an empty topic or too-short explanation", () => {
    const content = JSON.stringify({
      notes: [
        { topic: "  ", explanation: "A long enough explanation that should still be dropped.", evidencePassageIds: [`${TEST_LANGUAGE_ID}-c001`] },
        { topic: "syntax/short", explanation: "too short", evidencePassageIds: [`${TEST_LANGUAGE_ID}-c001`] }
      ]
    });

    const result = parseGeneratedNotes(content, noteGrounding());

    expect(result.notes).toHaveLength(0);
    expect(result.warnings).toHaveLength(2);
  });

  it("throws on unparseable model output", () => {
    expect(() => parseGeneratedNotes("Sorry, I cannot help with that.", noteGrounding())).toThrow(/valid JSON/);
  });
});

describe("parseGeneratedExercise", () => {
  it("drops hallucinated vocabulary, filters rule ids, and keeps real forms", () => {
    const content = JSON.stringify({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate to the target language: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki", "zzz-fake", "made-up"],
        allowedRuleIds: [`${TEST_LANGUAGE_ID}-note-basic-order`, "rule-that-does-not-exist"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "saku talo-na", reason: "Uses first-person suffix for a third-person subject." },
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." }
        ],
        gradingExplanation: "Subject saku precedes the verb talo with the third-person suffix -ki."
      }
    });

    const result = parseGeneratedExercise(content, exerciseGrounding());

    expect(result.exercise.allowedVocabulary).toEqual(["saku", "talo", "-ki"]);
    expect(result.exercise.allowedRuleIds).toEqual([`${TEST_LANGUAGE_ID}-note-basic-order`]);
    expect(result.exercise.expectedAnswers).toEqual(["saku talo-ki"]);
    expect(result.exercise.adversarialAnswers).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes("hallucinated vocabulary") && warning.includes("zzz-fake"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("rule-that-does-not-exist"))).toBe(true);
  });

  it("accepts the exercise object returned without an outer wrapper", () => {
    const content = JSON.stringify({
      type: "choose_particle",
      prompt: "Choose the first-person suffix.",
      allowedVocabulary: ["-na", "-ki"],
      allowedRuleIds: [],
      expectedAnswers: ["-na"],
      adversarialAnswers: [
        { answer: "-ki", reason: "Third-person, not first." },
        { answer: "-lo", reason: "Past tense, not a person suffix." }
      ],
      gradingExplanation: "The suffix -na marks the first-person singular subject."
    });

    const result = parseGeneratedExercise(content, exerciseGrounding());
    expect(result.exercise.type).toBe("choose_particle");
    expect(result.exercise.allowedVocabulary).toEqual(["-na", "-ki"]);
  });

  it("defaults an unknown type with a warning", () => {
    const content = JSON.stringify({
      exercise: {
        type: "fill_in_the_blank",
        prompt: "Pick the right word.",
        allowedVocabulary: ["saku"],
        allowedRuleIds: [],
        expectedAnswers: ["saku"],
        adversarialAnswers: [
          { answer: "talo", reason: "Wrong word." },
          { answer: "mira", reason: "Also wrong." }
        ],
        gradingExplanation: "The expected answer saku is the correct child noun."
      }
    });

    const result = parseGeneratedExercise(content, exerciseGrounding());
    expect(result.exercise.type).toBe("translate_to_english");
    expect(result.warnings.some((warning) => warning.includes("unrecognized exercise type"))).toBe(true);
  });

  it("throws when grounding leaves no expected answers", () => {
    const content = JSON.stringify({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate something.",
        allowedVocabulary: ["saku", "talo"],
        allowedRuleIds: [],
        expectedAnswers: [],
        adversarialAnswers: [
          { answer: "x", reason: "wrong" },
          { answer: "y", reason: "wrong" }
        ],
        gradingExplanation: "Long enough grading explanation for this exercise."
      }
    });

    expect(() => parseGeneratedExercise(content, exerciseGrounding())).toThrow(/could not be grounded/);
  });

  it("throws when all vocabulary is hallucinated", () => {
    const content = JSON.stringify({
      exercise: {
        type: "choose_particle",
        prompt: "Pick one.",
        allowedVocabulary: ["fake-1", "fake-2"],
        allowedRuleIds: [],
        expectedAnswers: ["fake-1"],
        adversarialAnswers: [
          { answer: "fake-2", reason: "wrong" },
          { answer: "fake-3", reason: "wrong" }
        ],
        gradingExplanation: "A grading explanation long enough to pass the length check."
      }
    });

    expect(() => parseGeneratedExercise(content, exerciseGrounding())).toThrow(/could not be grounded/);
  });

  it("throws on unparseable model output", () => {
    expect(() => parseGeneratedExercise("not json at all", exerciseGrounding())).toThrow(/valid JSON/);
  });
});

describe("generateModelDraftNotes", () => {
  it("throws ModelRequiredError when the provider has no completeChat", async () => {
    await expect(generateModelDraftNotes({
      language,
      corpus,
      lexemes,
      existingNotes: notes,
      provider: providerWithoutChat
    })).rejects.toBeInstanceOf(ModelRequiredError);
  });

  it("calls the model and returns the grounded notes", async () => {
    const { provider, calls } = providerWithChat(JSON.stringify({
      notes: [
        {
          topic: "morphology/person/first-singular",
          explanation: "The suffix -na marks a first-person singular subject on the verb.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-c001`],
          confidence: "high"
        },
        {
          topic: "phonology/invented",
          explanation: "A claim grounded in a passage id that does not exist in the corpus.",
          evidencePassageIds: ["nope"]
        }
      ]
    }));

    const result = await generateModelDraftNotes({
      language,
      corpus,
      lexemes,
      existingNotes: notes,
      provider
    });

    expect(calls).toHaveLength(1);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]?.topic).toBe("morphology/person/first-singular");
    expect(result.warnings.some((warning) => warning.includes("ungrounded"))).toBe(true);
  });

  it("throws when the model returns unparseable output", async () => {
    const { provider } = providerWithChat("I cannot do that.");
    await expect(generateModelDraftNotes({
      language,
      corpus,
      lexemes,
      existingNotes: notes,
      provider
    })).rejects.toThrow(/valid JSON/);
  });
});

describe("generateModelExercise", () => {
  it("throws ModelRequiredError when the provider has no completeChat", async () => {
    await expect(generateModelExercise({
      language,
      lexemes,
      notes,
      corpus,
      provider: providerWithoutChat
    })).rejects.toBeInstanceOf(ModelRequiredError);
  });

  it("calls the model and returns a grounded exercise", async () => {
    const { provider, calls } = providerWithChat(JSON.stringify({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate to the target language: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki", "ghost-form"],
        allowedRuleIds: [`${TEST_LANGUAGE_ID}-note-basic-order`],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "saku talo-na", reason: "Wrong person suffix." },
          { answer: "talo saku-ki", reason: "Wrong word order." }
        ],
        gradingExplanation: "Subject saku precedes the verb talo with third-person -ki."
      }
    }));

    const result = await generateModelExercise({
      language,
      lexemes,
      notes,
      corpus,
      type: "translate_to_target",
      provider
    });

    expect(calls).toHaveLength(1);
    expect(result.exercise.type).toBe("translate_to_target");
    expect(result.exercise.allowedVocabulary).toEqual(["saku", "talo", "-ki"]);
    expect(result.warnings.some((warning) => warning.includes("ghost-form"))).toBe(true);
  });

  it("throws when the grounded exercise is unusable", async () => {
    const { provider } = providerWithChat(JSON.stringify({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate something.",
        allowedVocabulary: ["only-fake"],
        allowedRuleIds: [],
        expectedAnswers: ["only-fake"],
        adversarialAnswers: [
          { answer: "x", reason: "wrong" },
          { answer: "y", reason: "wrong" }
        ],
        gradingExplanation: "A grading explanation long enough to pass the check."
      }
    }));

    await expect(generateModelExercise({
      language,
      lexemes,
      notes,
      corpus,
      provider
    })).rejects.toThrow(/could not be grounded/);
  });
});
