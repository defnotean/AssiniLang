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
  const exercisePass = languageExercises.filter((exercise) =>
    exercise.expectedAnswers.every((answer) => gradeExerciseAnswer(exercise, answer).accepted)
  ).length;

  const generationCheckedExercises = languageExercises.filter((exercise) =>
    exercise.type === "translate_to_target" || exercise.type === "segment" || exercise.type === "choose_particle"
  );
  let generationPolicyPass = 0;
  for (const exercise of generationCheckedExercises) {
    const passesPolicy = exercise.expectedAnswers.every((answer) =>
      answerUsesAllowedVocabulary(answer, exercise.allowedVocabulary)
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
