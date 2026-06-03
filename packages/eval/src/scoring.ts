import type { AppState, EvaluationFailure, Exercise, Note } from "@assini/db";

type LanguageScoreResult = {
  scores: Record<string, number>;
  failures: EvaluationFailure[];
};

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreRatio(pass: number, total: number): number {
  return total === 0 ? 1 : Number((pass / total).toFixed(4));
}

function answerKeyTopicMap(languageId: string, state: AppState): Map<string, Note> {
  return new Map(
    state.notes
      .filter((note) => note.languageId === languageId)
      .map((note) => [note.topic, note])
  );
}

function tokenUsesAllowedVocabulary(token: string, allowedForms: string[]): boolean {
  if (allowedForms.includes(token)) return true;
  if (!token.includes("-")) return false;

  let index = 0;
  const formsByLength = allowedForms.filter(Boolean).sort((left, right) => right.length - left.length);

  while (index < token.length) {
    const next = formsByLength.find((form) => token.startsWith(form, index));
    if (!next) return false;
    index += next.length;
  }

  return true;
}

function answerUsesAllowedVocabulary(answer: string, allowedForms: string[]): boolean {
  return answer
    .replace(/\|/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => tokenUsesAllowedVocabulary(token, allowedForms));
}

function segmentPieces(answer: string): string[] {
  return answer
    .replace(/\|/g, " ")
    .split(/\s+/)
    .map((piece) => normalize(piece))
    .filter(Boolean);
}

function sameSegmentSequence(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((piece, index) => piece === right[index]);
}

function segmentPromptTarget(prompt: string): string | undefined {
  const match = prompt.match(/^Segment:\s*(.+)$/i);
  return match?.[1]?.trim();
}

function boundarylessSegmentSurface(piece: string): string {
  return piece.replace(/^-|-$/g, "");
}

function segmentMatchLengthAt(target: string, piece: string, index: number): number | undefined {
  if (target.startsWith(piece, index)) {
    return piece.length;
  }

  const boundarylessPiece = boundarylessSegmentSurface(piece);
  if (boundarylessPiece && target.startsWith(boundarylessPiece, index)) {
    return boundarylessPiece.length;
  }

  return undefined;
}

function canonicalSegmentPieces(exercise: Exercise): string[] | undefined {
  const target = segmentPromptTarget(exercise.prompt);
  if (!target) return undefined;

  const normalizedTarget = normalize(target).replace(/\s+/g, "");
  const formsByLength = exercise.allowedVocabulary
    .map((piece) => normalize(piece))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  const pieces: string[] = [];
  let index = 0;

  while (index < normalizedTarget.length) {
    const next = formsByLength
      .map((piece) => ({ piece, matchLength: segmentMatchLengthAt(normalizedTarget, piece, index) }))
      .find((match): match is { piece: string; matchLength: number } => match.matchLength !== undefined);
    if (!next) return undefined;
    pieces.push(next.piece);
    index += next.matchLength;
  }

  return pieces;
}

function segmentAnswerMatchesExpectedBoundaries(answer: string, exercise: Exercise): boolean {
  const canonicalPieces = canonicalSegmentPieces(exercise);
  const submittedPieces = segmentPieces(answer);
  if (!canonicalPieces || submittedPieces.length === 0) {
    return false;
  }

  return sameSegmentSequence(submittedPieces, canonicalPieces);
}

function targetAnswerExistsInCorpus(languageId: string, state: AppState, answer: string): boolean {
  const normalizedAnswer = normalize(answer);
  return state.corpus.some(
    (passage) => passage.languageId === languageId && normalize(passage.textTarget) === normalizedAnswer
  );
}

function answerPassesGenerationPolicy(languageId: string, state: AppState, exercise: Exercise, answer: string): boolean {
  if (!answerUsesAllowedVocabulary(answer, exercise.allowedVocabulary)) {
    return false;
  }

  if (exercise.type === "translate_to_target") {
    return targetAnswerExistsInCorpus(languageId, state, answer);
  }

  if (exercise.type === "segment") {
    return segmentAnswerMatchesExpectedBoundaries(answer, exercise);
  }

  if (exercise.type === "choose_particle") {
    return exercise.allowedVocabulary.some((form) => normalize(form) === normalize(answer));
  }

  return true;
}

function deterministicNegativeProbeAnswers(exercise: Exercise): string[] {
  const probes = new Set<string>();

  for (const expected of exercise.expectedAnswers) {
    const normalizedExpected = normalize(expected.replace(/\|/g, " "));
    if (!normalizedExpected) continue;

    probes.add(`${normalizedExpected} __invalid__`);

    const parts = normalizedExpected.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      probes.add([...parts.slice(1), parts[0]].join(" "));
    }
  }

  return [...probes];
}

export function gradeExerciseAnswer(exercise: Exercise, answer: string): { accepted: boolean; explanation: string } {
  const normalizedAnswer = normalize(answer);
  const accepted = exercise.expectedAnswers.some((expected) => normalize(expected) === normalizedAnswer);

  return {
    accepted,
    explanation: accepted ? exercise.gradingExplanation : `Expected one of: ${exercise.expectedAnswers.join(" | ")}`
  };
}

export function scoreLanguageEvaluation(languageId: string, state: AppState, draftedNotes: Note[]): LanguageScoreResult {
  const failures: EvaluationFailure[] = [];
  const expectedByTopic = answerKeyTopicMap(languageId, state);
  const draftedByTopic = new Map(draftedNotes.map((note) => [note.topic, note]));

  let coveragePass = 0;
  let contentPass = 0;
  let evidencePass = 0;

  for (const [topic, expected] of expectedByTopic) {
    const drafted = draftedByTopic.get(topic);
    if (!drafted) {
      failures.push({ category: "noteCoverage", languageId, itemId: expected.id, message: `Missing note topic ${topic}` });
      failures.push({ category: "noteAccuracy", languageId, itemId: expected.id, message: `Missing note content for ${topic}` });
      failures.push({ category: "evidenceAccuracy", languageId, itemId: expected.id, message: `Missing note evidence for ${topic}` });
      continue;
    }

    coveragePass += 1;

    if (normalize(drafted.explanation) === normalize(expected.explanation)) {
      contentPass += 1;
    } else {
      failures.push({ category: "noteAccuracy", languageId, itemId: expected.id, message: `Explanation mismatch for ${topic}` });
    }

    const expectedEvidence = expected.evidencePassageIds.slice().sort().join("|");
    const draftedEvidence = drafted.evidencePassageIds.slice().sort().join("|");
    if (expectedEvidence === draftedEvidence) {
      evidencePass += 1;
    } else {
      failures.push({ category: "evidenceAccuracy", languageId, itemId: expected.id, message: `Evidence mismatch for ${topic}` });
    }
  }

  const languageCorpus = state.corpus.filter((passage) => passage.languageId === languageId);
  const segmentationPass = languageCorpus.filter((passage) => passage.morphologicalSegmentation.length > 0).length;
  const translationPass = languageCorpus.filter((passage) => passage.textTranslation.length > 0 && passage.textTarget.length > 0).length;

  const languageExercises = state.exercises.filter((exercise) => exercise.languageId === languageId);
  let exercisePass = 0;
  for (const exercise of languageExercises) {
    const acceptsExpectedAnswers = exercise.expectedAnswers.every((answer) => gradeExerciseAnswer(exercise, answer).accepted);
    const rejectsNegativeProbes = deterministicNegativeProbeAnswers(exercise).every(
      (answer) => !gradeExerciseAnswer(exercise, answer).accepted
    );

    if (acceptsExpectedAnswers && rejectsNegativeProbes) {
      exercisePass += 1;
    } else {
      failures.push({
        category: "exerciseGrading",
        languageId,
        itemId: exercise.id,
        message: rejectsNegativeProbes
          ? "Expected answer was rejected by the grader."
          : "Deterministic invalid answer was accepted by the grader."
      });
    }
  }

  const generationCheckedExercises = languageExercises.filter((exercise) =>
    exercise.type === "translate_to_target" || exercise.type === "segment" || exercise.type === "choose_particle"
  );
  let generationPolicyPass = 0;
  for (const exercise of generationCheckedExercises) {
    const passesPolicy = exercise.expectedAnswers.every((answer) =>
      answerPassesGenerationPolicy(languageId, state, exercise, answer)
    );
    if (passesPolicy) {
      generationPolicyPass += 1;
    } else {
      failures.push({
        category: "generationPolicy",
        languageId,
        itemId: exercise.id,
        message: "Expected answer uses forms outside the exercise allowed vocabulary."
      });
    }
  }

  return {
    scores: {
      noteCoverage: scoreRatio(coveragePass, expectedByTopic.size),
      noteAccuracy: scoreRatio(contentPass, expectedByTopic.size),
      evidenceAccuracy: scoreRatio(evidencePass, expectedByTopic.size),
      segmentationAccuracy: scoreRatio(segmentationPass, languageCorpus.length),
      translationAccuracy: scoreRatio(translationPass, languageCorpus.length),
      exerciseGrading: scoreRatio(exercisePass, languageExercises.length),
      generationPolicy: scoreRatio(generationPolicyPass, generationCheckedExercises.length)
    },
    failures
  };
}
