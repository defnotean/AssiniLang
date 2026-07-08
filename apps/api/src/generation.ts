import { z } from "zod";
import type { CorpusPassage, Exercise, Language, Lexeme, Note } from "@assini/db";
import type { LlmChatMessage, LlmProvider } from "./llmProvider.js";
import { readLlmEnvConfig, type Env } from "./llmEnvShared.js";
import { parseModelJson } from "./modelJson.js";
import { retrieveTopKPassages } from "@assini/eval";

/**
 * Model-backed, GROUNDED generation of draft grammar notes and a draft
 * exercise from a language's already-approved data. The point of this
 * module is to PREVENT hallucinated forms from entering the workspace:
 * every form, evidence passage, and rule id the model proposes is
 * validated against the real lexicon and corpus before it is returned.
 * Nothing here auto-commits; callers turn the output into reviewable
 * drafts.
 */

export type GeneratedNoteDraft = {
  topic: string;
  explanation: string;
  evidencePassageIds: string[];
  confidence: "low" | "medium" | "high";
};

export type GeneratedExerciseDraft = Pick<
  Exercise,
  | "type"
  | "prompt"
  | "allowedVocabulary"
  | "allowedRuleIds"
  | "expectedAnswers"
  | "adversarialAnswers"
  | "gradingExplanation"
>;

export type NoteGenerationResult = { notes: GeneratedNoteDraft[]; warnings: string[] };
export type ExerciseGenerationResult = { exercise: GeneratedExerciseDraft; warnings: string[] };

/**
 * Grounding data extracted from a language's approved workspace content.
 * The parse/ground helpers take this explicitly so they can be unit
 * tested without a provider.
 */
export type NoteGrounding = {
  passageIds: Set<string>;
  noteTopics: Set<string>;
};

export type ExerciseGrounding = {
  lexemeForms: Set<string>;
  noteIds: Set<string>;
};

/**
 * Thrown when generation is requested but the configured provider has no
 * `completeChat` (the deterministic fallback). The route maps this to
 * HTTP 400 with setup guidance — generation is an explicit model feature
 * and, unlike ingestion, has no offline heuristic fallback.
 */
export class ModelRequiredError extends Error {
  constructor(
    message = "Draft generation needs a configured language model. Set ASSINI_LLM_PROVIDER (and base URL/model or API key) to enable it; the deterministic fallback cannot generate drafts."
  ) {
    super(message);
    this.name = "ModelRequiredError";
  }
}

const EXERCISE_TYPES = [
  "translate_to_target",
  "translate_to_english",
  "segment",
  "choose_particle"
] as const satisfies readonly Exercise["type"][];

const DEFAULT_EXERCISE_TYPE: Exercise["type"] = "translate_to_english";

const MAX_CONTEXT_CHARS = 4_000;
const MAX_CONTEXT_PASSAGES = 6;
const MAX_CONTEXT_LEXEMES = 50;
const MAX_CONTEXT_NOTES = 12;
const MAX_GENERATED_NOTES = 3;
const MIN_EXPLANATION_CHARS = 24;
const MIN_GRADING_EXPLANATION_CHARS = 24;
const MIN_ADVERSARIAL_ANSWERS = 2;
const MAX_GENERATED_EXPECTED_ANSWERS = 12;
const MAX_GENERATED_ADVERSARIAL_ANSWERS = 12;
const REASONING_ONLY_PATTERN = /reasoning_content/i;

const confidenceSchema = z.enum(["low", "medium", "high"]).catch("medium");

const generatedNotesSchema = z.object({
  notes: z.array(z.object({
    topic: z.string(),
    explanation: z.string(),
    evidencePassageIds: z.array(z.string()).optional(),
    confidence: confidenceSchema.optional()
  })).optional()
});

const generatedExerciseSchema = z.object({
  type: z.string().optional(),
  prompt: z.string().optional(),
  allowedVocabulary: z.array(z.string()).optional(),
  allowedRuleIds: z.array(z.string()).optional(),
  expectedAnswers: z.array(z.string()).optional(),
  adversarialAnswers: z.array(z.object({
    answer: z.string(),
    reason: z.string()
  })).optional(),
  gradingExplanation: z.string().optional()
});

/**
 * The model is asked to return `{ exercise: {...} }`, but lenient models
 * sometimes return the exercise object directly. Accept either shape.
 */
function unwrapExercise(parsed: unknown): unknown {
  if (parsed && typeof parsed === "object" && "exercise" in parsed) {
    const inner = (parsed as { exercise?: unknown }).exercise;
    if (inner && typeof inner === "object") return inner;
  }
  return parsed;
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeForm(form: string): string {
  return form.trim().toLowerCase();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  return cleaned;
}

function partitionGroundedStrings(
  values: string[] | undefined,
  isAllowed: (value: string) => boolean
): { kept: string[]; dropped: string[] } {
  const requested = dedupeStrings(values ?? []);
  return {
    kept: requested.filter(isAllowed),
    dropped: requested.filter((value) => !isAllowed(value))
  };
}

// --- context building ------------------------------------------------------

type GenerationContext = {
  corpus: CorpusPassage[];
  lexemes: Lexeme[];
  notes: Note[];
};

function describeLanguage(language: Language): string[] {
  const phonologyNote = language.phonology
    ? `Declared phonology — consonants: ${language.phonology.consonants.join(", ") || "(none)"}; vowels: ${language.phonology.vowels.join(", ") || "(none)"}.`
    : "No phonology inventory has been declared yet.";
  return [
    `Language: ${language.name} (typology: ${language.typology}).`,
    `Description: ${language.description}`,
    `Orthography: ${language.orthography}`,
    phonologyNote
  ];
}

/**
 * Serializes the approved data the model is allowed to draw on, capped at
 * MAX_CONTEXT_CHARS so prompts stay bounded the way ingestion caps its
 * chunk size. Passages, lexemes, and existing note topics are added until
 * the budget is exhausted.
 */
function serializeContext(context: GenerationContext): string {
  const sections: string[] = [];

  const passages = context.corpus.slice(0, MAX_CONTEXT_PASSAGES).map((passage) => ({
    id: passage.id,
    target: passage.textTarget,
    translation: passage.textTranslation,
    morphemes: passage.morphologicalSegmentation.map((morpheme) => ({
      surface: morpheme.surface,
      gloss: morpheme.gloss
    })),
    topicTags: passage.topicTags
  }));
  sections.push(`Approved corpus passages (the ONLY passages you may cite as evidence, by id):\n${JSON.stringify(passages)}`);

  const lexicon = context.lexemes.slice(0, MAX_CONTEXT_LEXEMES).map((lexeme) => ({
    form: lexeme.form,
    gloss: lexeme.gloss,
    partOfSpeech: lexeme.partOfSpeech
  }));
  sections.push(`Approved lexicon (the ONLY forms you may use as vocabulary):\n${JSON.stringify(lexicon)}`);

  const existingNotes = context.notes.slice(0, MAX_CONTEXT_NOTES).map((note) => ({
    id: note.id,
    topic: note.topic
  }));
  sections.push(`Existing grammar notes (do NOT duplicate these topics; cite ids as rules):\n${JSON.stringify(existingNotes)}`);

  const joined = sections.join("\n\n");
  return joined.length > MAX_CONTEXT_CHARS ? `${joined.slice(0, MAX_CONTEXT_CHARS - 3)}...` : joined;
}

export function buildNoteGenerationMessages(language: Language, context: GenerationContext): LlmChatMessage[] {
  const system = [
    "You are a careful descriptive linguist helping document a language from its already-approved data.",
    "Propose DRAFT grammar notes that describe patterns visible in the supplied corpus passages.",
    "Strict grounding rules:",
    "- Use ONLY forms that appear in the supplied corpus or lexicon. Never invent words, affixes, or translations.",
    "- Every note MUST cite one or more evidencePassageIds drawn from the supplied passage ids. A note with no real evidence is useless and will be discarded.",
    "- Do not restate an existing note topic.",
    "- Generate exactly 1 concise note when you see a non-duplicate grounded pattern. If nothing is safely new, return {\"notes\":[]}.",
    ...describeLanguage(language),
    "Respond with a single JSON object and nothing else, using exactly this shape:",
    JSON.stringify({
      notes: [
        {
          topic: "short/topic/path",
          explanation: "what the pattern is and how the cited evidence shows it (at least a sentence)",
          evidencePassageIds: ["<id from the supplied passages>"],
          confidence: "low|medium|high"
        }
      ]
    }),
    "Important for reasoning-capable local servers: put the JSON in the visible assistant content field, not only in reasoning_content.",
    "Keep the visible final JSON compact; do not include analysis, prose, markdown, or chain-of-thought outside the JSON."
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `Approved data to draw on:\n\n${serializeContext(context)}` }
  ];
}

function buildCompactNoteGenerationMessages(language: Language, context: GenerationContext): LlmChatMessage[] {
  const compactContext: GenerationContext = {
    corpus: context.corpus.slice(0, 2),
    lexemes: context.lexemes.slice(0, 24),
    notes: context.notes.slice(0, 8)
  };
  return [
    {
      role: "system",
      content: [
        "Return visible JSON only. Do not include analysis, markdown, or hidden-only reasoning.",
        "If you cannot safely create one new grounded note, return exactly {\"notes\":[]}.",
        "Use only the supplied passage ids as evidencePassageIds.",
        ...describeLanguage(language),
        "Required JSON shape:",
        JSON.stringify({
          notes: [
            {
              topic: "short/topic/path",
              explanation: "one concise grounded sentence",
              evidencePassageIds: ["<supplied passage id>"],
              confidence: "low|medium|high"
            }
          ]
        })
      ].join("\n\n")
    },
    { role: "user", content: `Small approved data sample:\n\n${serializeContext(compactContext)}` }
  ];
}

export function buildExerciseGenerationMessages(
  language: Language,
  context: GenerationContext,
  options: { type?: Exercise["type"] } = {}
): LlmChatMessage[] {
  const requestedType = options.type && EXERCISE_TYPES.includes(options.type) ? options.type : undefined;
  const system = [
    "You are a careful language-learning content author building a DRAFT exercise from already-approved data.",
    "Strict grounding rules:",
    "- allowedVocabulary may contain ONLY forms that appear in the supplied lexicon. Never invent forms.",
    "- allowedRuleIds may contain ONLY ids of the supplied existing grammar notes.",
    "- expectedAnswers must be answerable from the supplied data; provide at least one.",
    `- Provide at least ${MIN_ADVERSARIAL_ANSWERS} adversarialAnswers, each a plausible wrong answer with a short reason it is wrong.`,
    "- gradingExplanation must explain, in at least a sentence, why the expected answer is correct.",
    "- Produce exactly one compact exercise. Prefer a simple passage already present in the supplied corpus.",
    requestedType
      ? `Produce an exercise of type "${requestedType}".`
      : `Choose a suitable type from: ${EXERCISE_TYPES.join(", ")}.`,
    ...describeLanguage(language),
    "Respond with a single JSON object and nothing else, using exactly this shape:",
    JSON.stringify({
      exercise: {
        type: requestedType ?? "translate_to_english",
        prompt: "the task shown to the learner",
        allowedVocabulary: ["<form from the supplied lexicon>"],
        allowedRuleIds: ["<id from the supplied notes>"],
        expectedAnswers: ["<correct answer>"],
        adversarialAnswers: [{ answer: "<plausible wrong answer>", reason: "<why it is wrong>" }],
        gradingExplanation: "why the expected answer is correct"
      }
    }),
    "Important for reasoning-capable local servers: put the JSON in the visible assistant content field, not only in reasoning_content.",
    "Keep the visible final JSON compact; do not include analysis, prose, markdown, or chain-of-thought outside the JSON."
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `Approved data to draw on:\n\n${serializeContext(context)}` }
  ];
}

function buildCompactExerciseGenerationMessages(
  language: Language,
  context: GenerationContext,
  options: { type?: Exercise["type"] } = {}
): LlmChatMessage[] {
  const requestedType = options.type && EXERCISE_TYPES.includes(options.type) ? options.type : DEFAULT_EXERCISE_TYPE;
  const compactContext: GenerationContext = {
    corpus: context.corpus.slice(0, 2),
    lexemes: context.lexemes.slice(0, 24),
    notes: context.notes.slice(0, 6)
  };

  return [
    {
      role: "system",
      content: [
        "Return visible JSON only. Do not include analysis, markdown, or hidden-only reasoning.",
        "Create exactly one compact grounded language-learning exercise.",
        `The exercise type must be "${requestedType}".`,
        "Use only supplied vocabulary forms and supplied note ids.",
        ...describeLanguage(language),
        "Required JSON shape:",
        JSON.stringify({
          exercise: {
            type: requestedType,
            prompt: "short learner-facing task",
            allowedVocabulary: ["<form from supplied lexicon>"],
            allowedRuleIds: ["<id from supplied notes>"],
            expectedAnswers: ["<correct answer>"],
            adversarialAnswers: [
              { answer: "<plausible wrong answer>", reason: "<why it is wrong>" },
              { answer: "<another plausible wrong answer>", reason: "<why it is wrong>" }
            ],
            gradingExplanation: "one concise grounded sentence"
          }
        })
      ].join("\n\n")
    },
    { role: "user", content: `Small approved data sample:\n\n${serializeContext(compactContext)}` }
  ];
}

// --- parsing + grounding ---------------------------------------------------

/**
 * Parses the model's notes JSON and GROUNDS it against the language's real
 * data. Keeps only evidencePassageIds that exist; drops any note left with
 * zero valid evidence (an ungrounded claim) with a warning; requires a
 * non-empty topic and a substantive explanation; dedupes by normalized
 * topic against existing notes AND within the batch; caps the count.
 */
export function parseGeneratedNotes(content: string, grounding: NoteGrounding): NoteGenerationResult {
  const parsed = parseModelJson(content);
  if (parsed === undefined) {
    throw new Error("The model did not return valid JSON for note generation. Try again.");
  }

  const result = generatedNotesSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("The model returned JSON that did not match the expected note shape. Try again.");
  }

  const warnings: string[] = [];
  const notes: GeneratedNoteDraft[] = [];
  const seenTopics = new Set<string>([...grounding.noteTopics].map(normalizeTopic));

  for (const raw of result.data.notes ?? []) {
    if (notes.length >= MAX_GENERATED_NOTES) {
      warnings.push(`Model proposed more than ${MAX_GENERATED_NOTES} notes; extra notes were dropped.`);
      break;
    }

    const topic = raw.topic.trim();
    const explanation = raw.explanation.trim();
    if (topic.length === 0) {
      warnings.push("Dropped a generated note with an empty topic.");
      continue;
    }
    if (explanation.length < MIN_EXPLANATION_CHARS) {
      warnings.push(`Dropped generated note "${topic}" because its explanation was too short to be useful.`);
      continue;
    }

    const { kept: validEvidence, dropped: droppedEvidence } = partitionGroundedStrings(
      raw.evidencePassageIds,
      (id) => grounding.passageIds.has(id)
    );
    if (validEvidence.length === 0) {
      warnings.push(
        `Dropped ungrounded generated note "${topic}" because none of its evidence passages (${droppedEvidence.join(", ") || "none provided"}) exist in the approved corpus.`
      );
      continue;
    }
    if (droppedEvidence.length > 0) {
      warnings.push(`Generated note "${topic}" cited ${droppedEvidence.length} unknown evidence passage id(s) that were dropped: ${droppedEvidence.join(", ")}.`);
    }

    const normalizedTopic = normalizeTopic(topic);
    if (seenTopics.has(normalizedTopic)) {
      warnings.push(`Dropped generated note "${topic}" because its topic duplicates an existing or already-generated note.`);
      continue;
    }
    seenTopics.add(normalizedTopic);

    notes.push({
      topic,
      explanation,
      evidencePassageIds: validEvidence,
      confidence: raw.confidence ?? "medium"
    });
  }

  return { notes, warnings };
}

function coerceExerciseType(rawType: string | undefined, warnings: string[]): Exercise["type"] {
  const trimmed = rawType?.trim();
  if (trimmed && (EXERCISE_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as Exercise["type"];
  }
  warnings.push(
    `Model produced an unrecognized exercise type (${trimmed ?? "missing"}); defaulted to "${DEFAULT_EXERCISE_TYPE}".`
  );
  return DEFAULT_EXERCISE_TYPE;
}

/**
 * Parses the model's exercise JSON and GROUNDS it. The type must be a valid
 * Exercise type (else default + warn); allowedVocabulary is filtered to
 * forms that exist in the lexicon (hallucinated tokens dropped + warn);
 * allowedRuleIds is filtered to existing note ids; expectedAnswers must be
 * non-empty and there must be at least two adversarialAnswers and a
 * substantive gradingExplanation. If grounding leaves the exercise
 * unusable (no expected answers, or empty allowedVocabulary) this throws a
 * clear Error so the caller does not surface a hollow draft.
 */
export function parseGeneratedExercise(content: string, grounding: ExerciseGrounding): ExerciseGenerationResult {
  const parsed = parseModelJson(content);
  if (parsed === undefined) {
    throw new Error("The model did not return valid JSON for exercise generation. Try again.");
  }

  const result = generatedExerciseSchema.safeParse(unwrapExercise(parsed));
  if (!result.success) {
    throw new Error("The model returned JSON that did not match the expected exercise shape. Try again.");
  }
  const raw = result.data;

  const warnings: string[] = [];
  const type = coerceExerciseType(raw.type, warnings);

  const { kept: allowedVocabulary, dropped: droppedVocabulary } = partitionGroundedStrings(
    raw.allowedVocabulary,
    (form) => grounding.lexemeForms.has(normalizeForm(form))
  );
  if (droppedVocabulary.length > 0) {
    warnings.push(`Dropped ${droppedVocabulary.length} hallucinated vocabulary form(s) not in the approved lexicon: ${droppedVocabulary.join(", ")}.`);
  }

  const { kept: allowedRuleIds, dropped: droppedRuleIds } = partitionGroundedStrings(
    raw.allowedRuleIds,
    (id) => grounding.noteIds.has(id)
  );
  if (droppedRuleIds.length > 0) {
    warnings.push(`Dropped ${droppedRuleIds.length} rule id(s) that do not match an existing note: ${droppedRuleIds.join(", ")}.`);
  }

  const expectedAnswers = dedupeStrings(raw.expectedAnswers ?? []).slice(0, MAX_GENERATED_EXPECTED_ANSWERS);

  const expectedKeys = new Set(expectedAnswers.map(normalizeForm));
  const seenAdversarial = new Set<string>();
  const adversarialAnswers: Exercise["adversarialAnswers"] = [];
  for (const candidate of raw.adversarialAnswers ?? []) {
    if (adversarialAnswers.length >= MAX_GENERATED_ADVERSARIAL_ANSWERS) break;
    const answer = candidate.answer.trim();
    const reason = candidate.reason.trim();
    const key = normalizeForm(answer);
    if (answer.length === 0 || reason.length === 0) continue;
    if (expectedKeys.has(key) || seenAdversarial.has(key)) continue;
    seenAdversarial.add(key);
    adversarialAnswers.push({ answer, reason });
  }

  const prompt = (raw.prompt ?? "").trim();
  const gradingExplanation = (raw.gradingExplanation ?? "").trim();

  const ungroundable: string[] = [];
  if (expectedAnswers.length === 0) ungroundable.push("it produced no usable expected answers");
  if (allowedVocabulary.length === 0) ungroundable.push("none of its vocabulary exists in the approved lexicon");
  if (prompt.length === 0) ungroundable.push("it produced no prompt");
  if (ungroundable.length > 0) {
    throw new Error(
      `The model produced an exercise that could not be grounded in the approved lexicon/notes (${ungroundable.join("; ")}). Try again or author manually.`
    );
  }

  if (adversarialAnswers.length < MIN_ADVERSARIAL_ANSWERS) {
    warnings.push(
      `Generated exercise has only ${adversarialAnswers.length} grounded adversarial answer(s); at least ${MIN_ADVERSARIAL_ANSWERS} are recommended before accepting.`
    );
  }
  if (gradingExplanation.length < MIN_GRADING_EXPLANATION_CHARS) {
    warnings.push("Generated exercise grading explanation was very short; review it before accepting.");
  }

  return {
    exercise: {
      type,
      prompt,
      allowedVocabulary,
      allowedRuleIds,
      expectedAnswers,
      adversarialAnswers,
      gradingExplanation
    },
    warnings
  };
}

// --- grounding builders ----------------------------------------------------

function buildNoteGrounding(corpus: CorpusPassage[], existingNotes: Note[]): NoteGrounding {
  return {
    passageIds: new Set(corpus.map((passage) => passage.id)),
    noteTopics: new Set(existingNotes.map((note) => note.topic))
  };
}

function buildExerciseGrounding(lexemes: Lexeme[], notes: Note[]): ExerciseGrounding {
  return {
    lexemeForms: new Set(lexemes.map((lexeme) => normalizeForm(lexeme.form))),
    noteIds: new Set(notes.map((note) => note.id))
  };
}

function isReasoningOnlyGenerationError(error: unknown): boolean {
  return error instanceof Error && REASONING_ONLY_PATTERN.test(error.message);
}

function buildRetrievalLlmConfig(env: Env) {
  const { provider, baseUrl, model, explicitApiKey, remoteApiKey } = readLlmEnvConfig(env);
  const isRemoteProvider = provider === "openai" || provider === "remote";
  return {
    baseUrl,
    apiKey: isRemoteProvider ? remoteApiKey : explicitApiKey,
    model,
    provider
  };
}

// --- orchestrators ---------------------------------------------------------

export async function generateModelDraftNotes(params: {
  language: Language;
  corpus: CorpusPassage[];
  lexemes: Lexeme[];
  existingNotes: Note[];
  provider: LlmProvider;
  env?: Env;
}): Promise<NoteGenerationResult> {
  if (!params.provider.completeChat) {
    throw new ModelRequiredError();
  }

  const env = params.env ?? process.env;
  const llmConfig = buildRetrievalLlmConfig(env);

  const query = `${params.language.name} ${params.language.description} ${params.language.orthography}`;
  const retrievedCorpus = await retrieveTopKPassages(query, params.corpus, 4, llmConfig);

  const messages = buildNoteGenerationMessages(params.language, {
    corpus: retrievedCorpus,
    lexemes: params.lexemes,
    notes: params.existingNotes
  });
  // Ground against the full approved corpus so a cited passage that exists in
  // the language is kept even when retrieval only surfaced a subset in-prompt.
  const grounding = buildNoteGrounding(params.corpus, params.existingNotes);
  try {
    const content = await params.provider.completeChat(messages);
    return parseGeneratedNotes(content, grounding);
  } catch (error) {
    if (!isReasoningOnlyGenerationError(error)) {
      throw error;
    }
  }

  const retryWarnings = [
    "Model returned only reasoning_content for draft-note generation; retried with a smaller JSON-only prompt."
  ];
  try {
    const retryContent = await params.provider.completeChat(buildCompactNoteGenerationMessages(params.language, {
      corpus: retrievedCorpus,
      lexemes: params.lexemes,
      notes: params.existingNotes
    }));
    const retryResult = parseGeneratedNotes(retryContent, grounding);
    return { notes: retryResult.notes, warnings: [...retryWarnings, ...retryResult.warnings] };
  } catch (retryError) {
    if (!isReasoningOnlyGenerationError(retryError)) {
      throw retryError;
    }
    return {
      notes: [],
      warnings: [
        ...retryWarnings,
        "Model again returned only reasoning_content for draft-note generation; no draft notes were created."
      ]
    };
  }
}

export async function generateModelExercise(params: {
  language: Language;
  lexemes: Lexeme[];
  notes: Note[];
  corpus: CorpusPassage[];
  type?: Exercise["type"];
  provider: LlmProvider;
  env?: Env;
}): Promise<ExerciseGenerationResult> {
  if (!params.provider.completeChat) {
    throw new ModelRequiredError();
  }

  const messages = buildExerciseGenerationMessages(
    params.language,
    { corpus: params.corpus, lexemes: params.lexemes, notes: params.notes },
    { type: params.type }
  );
  const grounding = buildExerciseGrounding(params.lexemes, params.notes);
  try {
    const content = await params.provider.completeChat(messages);
    return parseGeneratedExercise(content, grounding);
  } catch (error) {
    if (!isReasoningOnlyGenerationError(error)) {
      throw error;
    }
  }

  const retryWarnings = [
    "Model returned only reasoning_content for exercise generation; retried with a smaller JSON-only prompt."
  ];
  try {
    const retryContent = await params.provider.completeChat(buildCompactExerciseGenerationMessages(
      params.language,
      { corpus: params.corpus, lexemes: params.lexemes, notes: params.notes },
      { type: params.type }
    ));
    const retryResult = parseGeneratedExercise(retryContent, grounding);
    return {
      exercise: retryResult.exercise,
      warnings: [...retryWarnings, ...retryResult.warnings]
    };
  } catch (retryError) {
    if (!isReasoningOnlyGenerationError(retryError)) {
      throw retryError;
    }
    throw new Error(
      "Model returned only reasoning_content for exercise generation twice; no draft exercise was created. Try again or author manually."
    );
  }
}
