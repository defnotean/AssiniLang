import { z } from "zod";
import {
  languageSchema,
  corpusPassageSchema,
  corpusAnswerKeySchema,
  exerciseSchema,
  exerciseSubmissionSchema,
  userSchema,
  isReviewPolicyAssignableRole,
  reviewPolicySystemUpdaterIds,
  isReviewPolicyUpdaterRole,
  isExerciseSubmissionActorRole,
  LOCAL_PROTOTYPE_USERS,
  reviewPolicySchema
} from "./schemaDomains.js";
import {
  duplicatePersistedValue,
  normalizePersistedText,
  duplicateNormalizedPersistedValue,
  isBlankPersistedValue,
  addCorpusTextIntegrityIssues,
  addParseablePersistedDateIssue
} from "./schemaIntegrityCore.js";

export function addExerciseIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    exercises: Array<z.infer<typeof exerciseSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));
  const corpusTargetsByLanguage = new Map<string, Set<string>>();

  for (const passage of state.corpus) {
    const targets = corpusTargetsByLanguage.get(passage.languageId) ?? new Set<string>();
    targets.add(normalizePersistedText(passage.textTarget));
    corpusTargetsByLanguage.set(passage.languageId, targets);
  }

  for (const exercise of state.exercises) {
    const exerciseLanguageIdIsBlank = isBlankPersistedValue(exercise.languageId);
    if (exerciseLanguageIdIsBlank) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise languageId must not be blank: ${exercise.id}`,
        path: ["exercises", exercise.id]
      });
    } else if (!languageIds.has(exercise.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise references missing language: ${exercise.languageId}`,
        path: ["exercises", exercise.id]
      });
    }

    if (isBlankPersistedValue(exercise.prompt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise prompt must not be blank: ${exercise.id}`,
        path: ["exercises", exercise.id]
      });
    }

    if (isBlankPersistedValue(exercise.gradingExplanation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise grading explanation must not be blank: ${exercise.id}`,
        path: ["exercises", exercise.id]
      });
    }

    for (const ruleId of exercise.allowedRuleIds) {
      if (isBlankPersistedValue(ruleId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise allowed rule must not be blank",
          path: ["exercises", exercise.id]
        });
      }
    }

    for (const vocabulary of exercise.allowedVocabulary) {
      if (isBlankPersistedValue(vocabulary)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise allowed vocabulary must not be blank",
          path: ["exercises", exercise.id]
        });
      }
    }

    for (const answer of exercise.expectedAnswers) {
      if (isBlankPersistedValue(answer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise expected answer must not be blank",
          path: ["exercises", exercise.id]
        });
      }
    }

    const duplicateAllowedRule = duplicateNormalizedPersistedValue(exercise.allowedRuleIds);
    if (duplicateAllowedRule) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise allowed rule is duplicated: ${duplicateAllowedRule}`,
        path: ["exercises", exercise.id]
      });
    }

    const duplicateAllowedVocabulary = duplicateNormalizedPersistedValue(exercise.allowedVocabulary);
    if (duplicateAllowedVocabulary) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise allowed vocabulary is duplicated: ${duplicateAllowedVocabulary}`,
        path: ["exercises", exercise.id]
      });
    }

    const duplicateExpectedAnswer = duplicateNormalizedPersistedValue(exercise.expectedAnswers);
    if (duplicateExpectedAnswer) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise expected answer is duplicated: ${duplicateExpectedAnswer}`,
        path: ["exercises", exercise.id]
      });
    }

    if (exercise.adversarialAnswers.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise requires at least two adversarial probes: ${exercise.id}`,
        path: ["exercises", exercise.id]
      });
    }

    if (exercise.type === "translate_to_target" && !exerciseLanguageIdIsBlank) {
      const corpusTargets = corpusTargetsByLanguage.get(exercise.languageId) ?? new Set<string>();
      for (const answer of exercise.expectedAnswers) {
        if (!corpusTargets.has(normalizePersistedText(answer))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Translate-to-target expected answer is not present in corpus: ${answer}`,
            path: ["exercises", exercise.id]
          });
        }
      }
    }

    if (exercise.type === "choose_particle") {
      const allowedVocabulary = new Set(exercise.allowedVocabulary.map(normalizePersistedText));
      for (const answer of exercise.expectedAnswers) {
        if (!allowedVocabulary.has(normalizePersistedText(answer))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Choose-particle expected answer is not allowed vocabulary: ${answer}`,
            path: ["exercises", exercise.id]
          });
        }
      }
    }

    const normalizedExpected = new Set(exercise.expectedAnswers.map(normalizePersistedText));
    const normalizedAdversarial = new Set<string>();
    for (const adversarial of exercise.adversarialAnswers) {
      if (isBlankPersistedValue(adversarial.answer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise adversarial answer must not be blank",
          path: ["exercises", exercise.id]
        });
      }

      if (isBlankPersistedValue(adversarial.reason)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise adversarial reason must not be blank",
          path: ["exercises", exercise.id]
        });
      }

      const normalizedAnswer = normalizePersistedText(adversarial.answer);
      if (normalizedExpected.has(normalizedAnswer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Exercise adversarial answer duplicates an expected answer: ${adversarial.answer}`,
          path: ["exercises", exercise.id]
        });
      }

      if (normalizedAdversarial.has(normalizedAnswer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Exercise adversarial answer is duplicated: ${normalizedAnswer}`,
          path: ["exercises", exercise.id]
        });
      }
      normalizedAdversarial.add(normalizedAnswer);
    }
  }
}

export function addCorpusAnswerKeyIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    corpusAnswerKeys?: Array<z.infer<typeof corpusAnswerKeySchema>>;
  }
) {
  const passagesById = new Map(state.corpus.map((passage) => [passage.id, passage]));

  for (const answerKey of state.corpusAnswerKeys ?? []) {
    if (isBlankPersistedValue(answerKey.passageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Corpus answer key passageId must not be blank",
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
      continue;
    }

    const passage = passagesById.get(answerKey.passageId);
    if (!passage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus answer key references missing passage: ${answerKey.passageId}`,
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
      continue;
    }

    if (isBlankPersistedValue(answerKey.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Corpus answer key languageId must not be blank",
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
    } else if (answerKey.languageId !== passage.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus answer key language ${answerKey.languageId} does not match passage ${answerKey.passageId} language ${passage.languageId}`,
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
    }

    addCorpusTextIntegrityIssues(
      context,
      "corpusAnswerKeys",
      answerKey.passageId,
      "Corpus answer key",
      answerKey.textTarget,
      answerKey.textTranslation,
      answerKey.morphologicalSegmentation
    );
  }
}

export function addReviewPolicyIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    reviewPolicies: Array<z.infer<typeof reviewPolicySchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const assignableReviewerCount = users.filter((user) => isReviewPolicyAssignableRole(user.role)).length;
  const duplicatePolicyLanguageId = duplicatePersistedValue(state.reviewPolicies, (policy) => policy.languageId);
  if (duplicatePolicyLanguageId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate review policy for language: ${duplicatePolicyLanguageId}`,
      path: ["reviewPolicies"]
    });
  }

  for (const policy of state.reviewPolicies) {
    addParseablePersistedDateIssue(context, "reviewPolicies", policy.id, "Review policy updatedAt", policy.updatedAt);

    if (isBlankPersistedValue(policy.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy languageId must not be blank",
        path: ["reviewPolicies", policy.id]
      });
    } else if (!languageIds.has(policy.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review policy references missing language: ${policy.languageId}`,
        path: ["reviewPolicies", policy.id]
      });
    }

    if (isBlankPersistedValue(policy.updatedBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy updatedBy must not be blank",
        path: ["reviewPolicies", policy.id]
      });
    }

    const updater = usersById.get(policy.updatedBy);
    if (!reviewPolicySystemUpdaterIds.has(policy.updatedBy) && (!updater || !isReviewPolicyUpdaterRole(updater.role))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review policy updater is not allowed: ${policy.updatedBy}`,
        path: ["reviewPolicies", policy.id]
      });
    }

    const duplicateReviewerId = duplicatePersistedValue(policy.assignedReviewerIds, (reviewerId) => reviewerId);
    if (duplicateReviewerId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy assignedReviewerIds must be unique",
        path: ["reviewPolicies", policy.id]
      });
      continue;
    }

    for (const reviewerId of policy.assignedReviewerIds) {
      if (isBlankPersistedValue(reviewerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Review policy assigned reviewer must not be blank",
          path: ["reviewPolicies", policy.id]
        });
        continue;
      }

      const reviewer = usersById.get(reviewerId);
      if (!reviewer) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Review policy references unknown reviewer: ${reviewerId}`,
          path: ["reviewPolicies", policy.id]
        });
        continue;
      }

      if (!isReviewPolicyAssignableRole(reviewer.role)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Review policy reviewer is not assignable: ${reviewerId}`,
          path: ["reviewPolicies", policy.id]
        });
      }
    }

    if (policy.requiresAssignedReviewer && policy.approvalThreshold > policy.assignedReviewerIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy approvalThreshold cannot exceed assigned reviewers",
        path: ["reviewPolicies", policy.id]
      });
    }

    if (!policy.requiresAssignedReviewer && policy.approvalThreshold > assignableReviewerCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy approvalThreshold cannot exceed assignable reviewers",
        path: ["reviewPolicies", policy.id]
      });
    }
  }
}

export function addExerciseSubmissionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    exercises: Array<z.infer<typeof exerciseSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    exerciseSubmissions: Array<z.infer<typeof exerciseSubmissionSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const exercisesById = new Map(state.exercises.map((exercise) => [exercise.id, exercise]));

  for (const submission of state.exerciseSubmissions) {
    if (isBlankPersistedValue(submission.answer)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission answer must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    }

    if (isBlankPersistedValue(submission.explanation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission explanation must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    }

    addParseablePersistedDateIssue(
      context,
      "exerciseSubmissions",
      submission.id,
      "Exercise submission submittedAt",
      submission.submittedAt
    );

    const submissionExerciseIdIsBlank = isBlankPersistedValue(submission.exerciseId);
    const submissionLanguageIdIsBlank = isBlankPersistedValue(submission.languageId);
    if (submissionExerciseIdIsBlank) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission exerciseId must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    }

    if (submissionLanguageIdIsBlank) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission languageId must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    }

    const exercise = submissionExerciseIdIsBlank ? undefined : exercisesById.get(submission.exerciseId);
    if (!submissionExerciseIdIsBlank && !exercise) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise submission references missing exercise: ${submission.exerciseId}`,
        path: ["exerciseSubmissions", submission.id]
      });
    } else if (exercise && !submissionLanguageIdIsBlank && submission.languageId !== exercise.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise submission language ${submission.languageId} does not match exercise ${submission.exerciseId} language ${exercise.languageId}`,
        path: ["exerciseSubmissions", submission.id]
      });
    }

    const learner = isBlankPersistedValue(submission.learnerId) ? undefined : usersById.get(submission.learnerId);
    if (isBlankPersistedValue(submission.learnerId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission learnerId must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    } else if (!learner || !isExerciseSubmissionActorRole(learner.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise submission learner is not allowed: ${submission.learnerId}`,
        path: ["exerciseSubmissions", submission.id]
      });
    }
  }
}
