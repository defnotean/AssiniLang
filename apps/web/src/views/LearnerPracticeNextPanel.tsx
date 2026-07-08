import type { RecommendedExercises } from "../api";
import { useI18n } from "../i18n";
import type { AsyncState } from "../lib/types";

const PRACTICE_NEXT_LIMIT = 3;

export function LearnerPracticeNextPanel({
  practiceState,
  isWorkflowBusy,
  onSelectExercise
}: {
  practiceState: AsyncState<RecommendedExercises>;
  isWorkflowBusy: boolean;
  onSelectExercise: (exerciseId: string) => void;
}) {
  const { t } = useI18n();

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
      return <p className="inline-empty">{t("learner.noPracticeRecommendationsYet")}</p>;
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
