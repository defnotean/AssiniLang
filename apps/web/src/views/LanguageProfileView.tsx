import type { LanguageProfile } from "../api";
import { ConfidenceBadge } from "../components/badges";
import { formatParadigmDimension, formatPartOfSpeech, formatTypology } from "../lib/format";
import type { AsyncState } from "../lib/types";
import { useI18n } from "../i18n";

export function LanguageProfileView({ profileState }: { profileState: AsyncState<LanguageProfile> }) {
  const { t } = useI18n();
  if (profileState.status === "loading" || profileState.status === "idle") {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        {t("profile.loadingProfile")}
      </div>
    );
  }

  if (profileState.status === "error") {
    return (
      <div className="panel-card error" role="alert">
        {profileState.message}
      </div>
    );
  }

  const { language, stats, phonology, grammarRules, vocabulary, morphemeInventory, paradigmGaps = [] } = profileState.data;

  return (
    <div className="profile-view">
      <section className="panel-card profile-summary" aria-label={t("profile.summaryAriaLabel")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("profile.languageProfile")}</span>
            <h2>{language.name}</h2>
          </div>
          <span className="id-badge">{language.id}</span>
        </div>
        <p className="explanation">{language.description}</p>
        <dl className="detail-grid">
          <div>
            <dt>{t("profile.typology")}</dt>
            <dd>{formatTypology(language.typology, t)}</dd>
          </div>
          <div>
            <dt>{t("profile.vocabulary")}</dt>
            <dd>{stats.vocabularyItems}</dd>
          </div>
          <div>
            <dt>{t("profile.grammarRules")}</dt>
            <dd>{stats.grammarRules}</dd>
          </div>
          <div>
            <dt>{t("profile.exerciseTypes")}</dt>
            <dd>{Object.keys(stats.exerciseTypes).length}</dd>
          </div>
          <div>
            <dt>{t("profile.corpusPassages")}</dt>
            <dd>{stats.corpusPassages}</dd>
          </div>
          <div>
            <dt>{t("profile.notes")}</dt>
            <dd>{stats.notes}</dd>
          </div>
          <div>
            <dt>{t("profile.exercises")}</dt>
            <dd>{stats.exercises}</dd>
          </div>
          <div>
            <dt>{t("profile.sourceAssets")}</dt>
            <dd>{stats.sourceAssets}</dd>
          </div>
          <div>
            <dt>{t("profile.pendingExtractionDrafts")}</dt>
            <dd>{stats.pendingExtractionDrafts}</dd>
          </div>
        </dl>
      </section>

      {phonology ? (
        <section className="panel-card phonology-panel" aria-label={t("profile.phonologyAriaLabel")}>
          <div className="record-topline">
            <div>
              <span className="detail-label">{t("profile.phonologyProfile")}</span>
              <h2>{phonology.syllableTemplate ?? t("profile.syllableTemplateNotSet")}</h2>
            </div>
            {phonology.stress && <span className="id-badge">{phonology.stress}</span>}
          </div>
          <dl className="detail-grid">
            <div>
              <dt>{t("profile.consonants")}</dt>
              <dd>{phonology.consonants.length > 0 ? phonology.consonants.join(" ") : t("profile.noneRecorded")}</dd>
            </div>
            <div>
              <dt>{t("profile.vowels")}</dt>
              <dd>{phonology.vowels.length > 0 ? phonology.vowels.join(" ") : t("profile.noneRecorded")}</dd>
            </div>
          </dl>
          <div className="detail-list">
            {phonology.notes.map((note) => (
              <p className="detail-row" key={note}>{note}</p>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel-card phonology-panel" aria-label={t("profile.phonologyAriaLabel")}>
          <div className="record-topline">
            <div>
              <span className="detail-label">{t("profile.phonologyProfile")}</span>
              <h2>{t("profile.noPhonologyDeclared")}</h2>
            </div>
          </div>
          <p className="empty-state" role="status" aria-live="polite">{t("profile.phonologyEmptyState")}</p>
        </section>
      )}

      <section className="panel-card grammar-panel" aria-label={t("profile.grammarInventory")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("profile.grammarInventory")}</span>
            <h2>
              {grammarRules.length === 1
                ? t("profile.ruleCountOne", { count: grammarRules.length })
                : t("profile.ruleCountMany", { count: grammarRules.length })}
            </h2>
          </div>
        </div>
        <div className="detail-list">
          {grammarRules.length === 0 ? (
            <p className="empty-state" role="status">{t("profile.grammarEmptyState")}</p>
          ) : grammarRules.map((rule) => (
            <article className="detail-row grammar-rule-row" key={rule.id}>
              <div>
                <strong>{rule.topic}</strong>
                <p>{rule.explanation}</p>
              </div>
              <ConfidenceBadge confidence={rule.confidence} />
              <div className="pill-row">
                {rule.evidencePassageIds.map((passageId, index) => (
                  <span className="pill" key={`${index}:${passageId}`}>{passageId}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card vocabulary-panel" aria-label={t("profile.vocabularyInventory")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("profile.vocabularyInventory")}</span>
            <h2>
              {vocabulary.length === 1
                ? t("profile.entryCountOne", { count: vocabulary.length })
                : t("profile.entryCountMany", { count: vocabulary.length })}
            </h2>
          </div>
        </div>
        <div className="vocabulary-grid">
          {vocabulary.length === 0 ? (
            <p className="empty-state" role="status">{t("profile.vocabularyEmptyState")}</p>
          ) : vocabulary.map((item) => (
            <article className="vocabulary-entry" key={item.id}>
              <code>{item.form}</code>
              <strong>{item.gloss}</strong>
              <span>{formatPartOfSpeech(item.partOfSpeech, t)}</span>
              <div className="pill-row">
                {item.tags.map((tag, index) => (
                  <span className="pill" key={`${item.id}:${index}:${tag}`}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card morpheme-panel" aria-label={t("profile.morphemeInventory")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("profile.morphemeInventory")}</span>
            <h2>
              {morphemeInventory.length === 1
                ? t("profile.morphemeCountOne", { count: morphemeInventory.length })
                : t("profile.morphemeCountMany", { count: morphemeInventory.length })}
            </h2>
          </div>
        </div>
        <div className="morpheme-grid">
          {morphemeInventory.length === 0 ? (
            <p className="empty-state" role="status">{t("profile.morphemeEmptyState")}</p>
          ) : morphemeInventory.map((item, index) => (
            <article className="morpheme-entry" key={`${index}:${item.surface}:${item.lemma}`}>
              <div className="morpheme-entry-topline">
                <code>{item.surface}</code>
                <span className="id-badge">
                  {item.occurrenceCount === 1
                    ? t("profile.corpusUseCountOne", { count: item.occurrenceCount })
                    : t("profile.corpusUseCountMany", { count: item.occurrenceCount })}
                </span>
              </div>
              <strong>{item.lemma}</strong>
              <span>{item.glosses.join(" / ")}</span>
              {item.vocabulary && (
                <small>{formatPartOfSpeech(item.vocabulary.partOfSpeech, t)}: {item.vocabulary.gloss}</small>
              )}
              <div className="pill-row">
                {item.features.map((feature, index) => (
                  <span className="pill" key={`${item.surface}:feature:${index}:${feature}`}>{feature}</span>
                ))}
              </div>
              <div className="pill-row">
                {item.passageIds.map((passageId, index) => (
                  <span className="pill" key={`${item.surface}:passage:${index}:${passageId}`}>{passageId}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card paradigm-gaps-panel" aria-label={t("profile.paradigmGaps")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("profile.paradigmGaps")}</span>
            <h2>
              {paradigmGaps.length === 1
                ? t("profile.fieldworkTodoCountOne", { count: paradigmGaps.length })
                : t("profile.fieldworkTodoCountMany", { count: paradigmGaps.length })}
            </h2>
          </div>
        </div>
        {paradigmGaps.length === 0 ? (
          <p className="empty-state" role="status" aria-live="polite">
            {t("profile.paradigmGapsEmptyState")}
          </p>
        ) : (
          <div className="detail-list">
            {paradigmGaps.map((gap, index) => (
              <article className="detail-row paradigm-gap-row" key={`${index}:${gap.lemma}:${gap.dimension}`}>
                <div className="paradigm-gap-topline">
                  <code>{gap.lemma}</code>
                  <span className="paradigm-gap-dimension">{formatParadigmDimension(gap.dimension, t)}</span>
                  <span className="id-badge">
                    {gap.evidencePassageIds.length === 1
                      ? t("profile.linkedPassageCountOne", { count: gap.evidencePassageIds.length })
                      : t("profile.linkedPassageCountMany", { count: gap.evidencePassageIds.length })}
                  </span>
                </div>
                <div className="pill-row">
                  {gap.attested.map((cell, index) => (
                    <span className="pill paradigm-cell-attested" key={`${gap.lemma}:attested:${index}:${cell}`}>{cell}</span>
                  ))}
                  {gap.missing.map((cell, index) => (
                    <span className="pill paradigm-cell-missing" key={`${gap.lemma}:missing:${index}:${cell}`}>
                      {t("profile.missingCell", { cell })}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
