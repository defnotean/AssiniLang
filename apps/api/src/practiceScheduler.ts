/**
 * SM-2-lite spaced-repetition priority for learner practice.
 *
 * Pure and deterministic: given the same exercises, submissions, learner, and
 * clock, the ranking is always identical and the inputs are never mutated.
 *
 * Rules:
 * - Never-attempted exercises rank first, in their original order.
 * - For attempted exercises, each consecutive correct answer (ending the
 *   chronological history) doubles the review interval starting at 1 day
 *   (1d, 2d, 4d, ... capped at 30d) measured from the last submission.
 *   A wrong answer resets the interval to 1 day.
 * - An exercise is overdue when now >= lastSubmittedAt + interval. Overdue
 *   exercises rank next (most overdue first), then not-yet-due exercises
 *   (soonest due first).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 30;

export type PracticeStatus = "new" | "overdue" | "scheduled";

export type PracticeSubmission = {
  exerciseId: string;
  learnerId: string;
  accepted: boolean;
  submittedAt: string;
};

export type PracticeRecommendation<E extends { id: string }> = {
  exercise: E;
  status: PracticeStatus;
  /** ISO timestamp the exercise is (or was) due for review. Absent for new exercises. */
  dueAt?: string;
  /** Consecutive correct answers at the end of the learner's history. */
  streak: number;
};

function intervalDaysForStreak(streak: number): number {
  if (streak <= 0) return 1;
  return Math.min(2 ** (streak - 1), MAX_INTERVAL_DAYS);
}

export function rankExercisesForPractice<E extends { id: string }>(
  exercises: readonly E[],
  submissions: readonly PracticeSubmission[],
  learnerId: string,
  now: Date
): PracticeRecommendation<E>[] {
  const historyByExercise = new Map<string, PracticeSubmission[]>();
  for (const submission of submissions) {
    if (submission.learnerId !== learnerId) continue;
    const history = historyByExercise.get(submission.exerciseId);
    if (history) {
      history.push(submission);
    } else {
      historyByExercise.set(submission.exerciseId, [submission]);
    }
  }

  const fresh: PracticeRecommendation<E>[] = [];
  const overdue: Array<{ recommendation: PracticeRecommendation<E>; dueAtMs: number; index: number }> = [];
  const scheduled: Array<{ recommendation: PracticeRecommendation<E>; dueAtMs: number; index: number }> = [];

  exercises.forEach((exercise, index) => {
    const history = historyByExercise.get(exercise.id);
    if (!history || history.length === 0) {
      fresh.push({ exercise, status: "new", streak: 0 });
      return;
    }

    const chronological = history
      .slice()
      .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt));

    let streak = 0;
    for (let position = chronological.length - 1; position >= 0; position -= 1) {
      if (!chronological[position].accepted) break;
      streak += 1;
    }

    const lastSubmittedAtMs = Date.parse(chronological[chronological.length - 1].submittedAt);
    const dueAtMs = lastSubmittedAtMs + intervalDaysForStreak(streak) * DAY_MS;
    const isOverdue = now.getTime() >= dueAtMs;
    const recommendation: PracticeRecommendation<E> = {
      exercise,
      status: isOverdue ? "overdue" : "scheduled",
      dueAt: new Date(dueAtMs).toISOString(),
      streak
    };

    (isOverdue ? overdue : scheduled).push({ recommendation, dueAtMs, index });
  });

  // Most overdue first == earliest due date first; ties keep original order.
  overdue.sort((left, right) => left.dueAtMs - right.dueAtMs || left.index - right.index);
  scheduled.sort((left, right) => left.dueAtMs - right.dueAtMs || left.index - right.index);

  return [...fresh, ...overdue.map((entry) => entry.recommendation), ...scheduled.map((entry) => entry.recommendation)];
}
