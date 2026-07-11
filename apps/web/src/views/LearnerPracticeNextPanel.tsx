import type { RecommendedExercises } from "../api";
import { useI18n } from "../i18n";
import type { AsyncState } from "../lib/types";

const PRACTICE_NEXT_LIMIT = 3;

export function LearnerPracticeNextPanel({
  practiceState,
  isWorkflowBusy,
  exerciseCount,
  onSelectExercise,
  onAuthorExercise,
  onOpenBuild
}: {
  practiceState: AsyncState<RecommendedExercises>;
  isWorkflowBusy: boolean;
  exerciseCount: number;
  onSelectExercise: (exerciseId: string) => void;
  onAuthorExercise: () => void;
  onOpenBuild?: () => void;
}) {
  const { t } = useI18n();

  function renderEmptyActions(includeBuild: boolean) {
    return (
      <div className="practice-next-actions">
        <button type="button" className="secondary" disabled={isWorkflowBusy} onClick={onAuthorExercise}>
          {t("learner.authorExerciseCta")}
        </button>
        {includeBuild && onOpenBuild && (
          <button type="button" className="secondary" disabled={isWorkflowBusy} onClick={onOpenBuild}>
            {t("learner.openBuildCta")}
          </button>
        )}
      </div>
    );
  }

  function renderPracticeNext() {
    if (practiceState.status === "idle" || practiceState.status === "loading") {
      return (
        <p className="inline-empty" role="status" aria-live="polite">
          {t("learner.loadingPracticeRecommendations")}
        </p>
      );
    }

    if (practiceState.status === "error") {
      return (
        <p className="result-notice error" role="alert">
          {practiceState.message}
        </p>
      );
    }

    const { exercises: recommended, rationale } = practiceState.data;
    if (recommended.length === 0) {
      if (exerciseCount === 0) {
        return (
          <div className="inline-empty" role="status" aria-live="polite">
            <p>{t("learner.noExercisesPracticeNext")}</p>
            <p className="muted">{t("learner.noExercisesPracticeNextHint")}</p>
            {renderEmptyActions(true)}
          </div>
        );
      }

      return (
        <div className="inline-empty" role="status" aria-live="polite">
          <p>{t("learner.noPracticeRecommendationsYet")}</p>
          <p className="muted">{t("learner.noPracticeRecommendationsWithExercisesHint")}</p>
          {renderEmptyActions(false)}
        </div>
      );
    }

    return (
      <div className="practice-next-list">
        {recommended.slice(0, PRACTICE_NEXT_LIMIT).map((exercise) => {
          const entry = rationale.find((item) => item.exerciseId === exercise.id);
          const status = entry?.status ?? "new";
          return (
            <div key={exercise.id} className="practice-next-item">
              <span className={`pill practice-status practice-status-${status}`}>
                {t(`learner.practiceStatus.${status}`)}
              </span>
              <span className="practice-next-prompt">{exercise.prompt}</span>
              <button
                type="button"
                className="secondary"
                disabled={isWorkflowBusy}
                onClick={() => onSelectExercise(exercise.id)}
              >
                {t("learner.practice")}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section className="record-card practice-next-panel" aria-label={t("learner.practiceNext")}>
      <h3>{t("learner.practiceNext")}</h3>
      {renderPracticeNext()}
    </section>
  );
}
