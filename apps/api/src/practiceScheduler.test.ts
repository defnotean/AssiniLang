import { describe, expect, it } from "vitest";
import { rankExercisesForPractice, type PracticeSubmission } from "./practiceScheduler.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type FixtureExercise = { id: string };

function exercise(id: string): FixtureExercise {
  return { id };
}

function submission(exerciseId: string, learnerId: string, accepted: boolean, submittedAt: string): PracticeSubmission {
  return { exerciseId, learnerId, accepted, submittedAt };
}

const NOW = new Date("2026-06-11T00:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

describe("rankExercisesForPractice", () => {
  it("ranks never-attempted exercises first, preserving original order", () => {
    const exercises = [exercise("ex-a"), exercise("ex-b"), exercise("ex-c")];
    const submissions = [submission("ex-b", "learner-1", true, daysAgo(10))];

    const ranked = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);

    expect(ranked.map((item) => item.exercise.id)).toEqual(["ex-a", "ex-c", "ex-b"]);
    expect(ranked[0]).toMatchObject({ status: "new", streak: 0 });
    expect(ranked[0].dueAt).toBeUndefined();
    expect(ranked[1]).toMatchObject({ status: "new", streak: 0 });
  });

  it("resets the review interval to 1 day after a wrong answer", () => {
    const exercises = [exercise("ex-a")];
    const submissions = [
      submission("ex-a", "learner-1", true, daysAgo(20)),
      submission("ex-a", "learner-1", true, daysAgo(15)),
      submission("ex-a", "learner-1", false, daysAgo(0.5))
    ];

    const ranked = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);

    // Last submission was wrong 12 hours ago -> interval is 1 day -> not yet due.
    expect(ranked[0]).toMatchObject({ status: "scheduled", streak: 0 });
    expect(ranked[0].dueAt).toBe(new Date(NOW.getTime() + 0.5 * DAY_MS).toISOString());
  });

  it("doubles the interval for each consecutive correct answer", () => {
    const exercises = [exercise("ex-a")];

    // 3 consecutive correct answers -> interval 4 days from last submission.
    const submissions = [
      submission("ex-a", "learner-1", true, daysAgo(30)),
      submission("ex-a", "learner-1", true, daysAgo(20)),
      submission("ex-a", "learner-1", true, daysAgo(2))
    ];

    const ranked = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);

    expect(ranked[0]).toMatchObject({ status: "scheduled", streak: 3 });
    expect(ranked[0].dueAt).toBe(new Date(NOW.getTime() + 2 * DAY_MS).toISOString());
  });

  it("marks an exercise overdue once now passes lastSubmittedAt plus the interval", () => {
    const exercises = [exercise("ex-a")];
    const submissions = [submission("ex-a", "learner-1", true, daysAgo(3))];

    const ranked = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);

    expect(ranked[0]).toMatchObject({ status: "overdue", streak: 1 });
    expect(ranked[0].dueAt).toBe(new Date(NOW.getTime() - 2 * DAY_MS).toISOString());
  });

  it("orders overdue exercises most-overdue first, then scheduled soonest-due first", () => {
    const exercises = [
      exercise("ex-soon-due"),
      exercise("ex-very-overdue"),
      exercise("ex-later-due"),
      exercise("ex-slightly-overdue")
    ];
    const submissions = [
      // streak 1 -> 1d interval; submitted 10d ago -> 9d overdue.
      submission("ex-very-overdue", "learner-1", true, daysAgo(10)),
      // streak 1 -> 1d interval; submitted 1.5d ago -> 0.5d overdue.
      submission("ex-slightly-overdue", "learner-1", true, daysAgo(1.5)),
      // streak 2 -> 2d interval; submitted 0.5d ago -> due in 1.5d.
      submission("ex-later-due", "learner-1", true, daysAgo(3)),
      submission("ex-later-due", "learner-1", true, daysAgo(0.5)),
      // streak 1 -> 1d interval; submitted 0.5d ago -> due in 0.5d.
      submission("ex-soon-due", "learner-1", true, daysAgo(0.5))
    ];

    const ranked = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);

    expect(ranked.map((item) => item.exercise.id)).toEqual([
      "ex-very-overdue",
      "ex-slightly-overdue",
      "ex-soon-due",
      "ex-later-due"
    ]);
    expect(ranked.map((item) => item.status)).toEqual(["overdue", "overdue", "scheduled", "scheduled"]);
  });

  it("caps the review interval at 30 days", () => {
    const exercises = [exercise("ex-a")];
    // 7 consecutive correct answers would give 64 days uncapped.
    const submissions = Array.from({ length: 7 }, (_, index) =>
      submission("ex-a", "learner-1", true, daysAgo(80 - index * 10))
    );

    const ranked = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);

    expect(ranked[0].streak).toBe(7);
    // Last submission 20 days ago + 30 day cap -> due in 10 days.
    expect(ranked[0].dueAt).toBe(new Date(NOW.getTime() + 10 * DAY_MS).toISOString());
    expect(ranked[0].status).toBe("scheduled");
  });

  it("ignores other learners' submissions", () => {
    const exercises = [exercise("ex-a"), exercise("ex-b")];
    const submissions = [
      submission("ex-a", "learner-2", false, daysAgo(5)),
      submission("ex-b", "learner-2", true, daysAgo(5))
    ];

    const ranked = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);

    expect(ranked.map((item) => item.exercise.id)).toEqual(["ex-a", "ex-b"]);
    expect(ranked.every((item) => item.status === "new")).toBe(true);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const exercises = [exercise("ex-a"), exercise("ex-b"), exercise("ex-c")];
    const submissions = [
      submission("ex-c", "learner-1", true, daysAgo(9)),
      submission("ex-a", "learner-1", false, daysAgo(4))
    ];
    const exercisesCopy = exercises.map((item) => ({ ...item }));
    const submissionsCopy = submissions.map((item) => ({ ...item }));

    const first = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);
    const second = rankExercisesForPractice(exercises, submissions, "learner-1", NOW);

    expect(first).toEqual(second);
    expect(exercises).toEqual(exercisesCopy);
    expect(submissions).toEqual(submissionsCopy);
  });
});
