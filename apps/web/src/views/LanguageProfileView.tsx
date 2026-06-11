import type { LanguageProfile } from "../api";
import { ConfidenceBadge } from "../components/badges";
import { formatCount } from "../lib/format";
import type { AsyncState } from "../lib/types";

export function LanguageProfileView({ profileState }: { profileState: AsyncState<LanguageProfile> }) {
  if (profileState.status === "loading" || profileState.status === "idle") {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        Loading language profile...
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
      <section className="panel-card profile-summary" aria-label="Language profile summary">
        <div className="record-topline">
          <div>
            <span className="detail-label">Language profile</span>
            <h2>{language.name}</h2>
          </div>
          <span className="id-badge">{language.id}</span>
        </div>
        <p className="explanation">{language.description}</p>
        <dl className="detail-grid">
          <div>
            <dt>Typology</dt>
            <dd>{language.typology}</dd>
          </div>
          <div>
            <dt>Vocabulary</dt>
            <dd>{stats.vocabularyItems}</dd>
          </div>
          <div>
            <dt>Grammar rules</dt>
            <dd>{stats.grammarRules}</dd>
          </div>
          <div>
            <dt>Exercise types</dt>
            <dd>{Object.keys(stats.exerciseTypes).length}</dd>
          </div>
          <div>
            <dt>Corpus passages</dt>
            <dd>{stats.corpusPassages}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{stats.notes}</dd>
          </div>
          <div>
            <dt>Exercises</dt>
            <dd>{stats.exercises}</dd>
          </div>
          <div>
            <dt>Source assets</dt>
            <dd>{stats.sourceAssets}</dd>
          </div>
          <div>
            <dt>Pending extraction drafts</dt>
            <dd>{stats.pendingExtractionDrafts}</dd>
          </div>
        </dl>
      </section>

      {phonology ? (
        <section className="panel-card phonology-panel" aria-label="Phonology profile">
          <div className="record-topline">
            <div>
              <span className="detail-label">Phonology profile</span>
              <h2>{phonology.syllableTemplate ?? "Syllable template not set"}</h2>
            </div>
            {phonology.stress && <span className="id-badge">{phonology.stress}</span>}
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Consonants</dt>
              <dd>{phonology.consonants.length > 0 ? phonology.consonants.join(" ") : "None recorded"}</dd>
            </div>
            <div>
              <dt>Vowels</dt>
              <dd>{phonology.vowels.length > 0 ? phonology.vowels.join(" ") : "None recorded"}</dd>
            </div>
          </dl>
          <div className="detail-list">
            {phonology.notes.map((note) => (
              <p className="detail-row" key={note}>{note}</p>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel-card phonology-panel" aria-label="Phonology profile">
          <div className="record-topline">
            <div>
              <span className="detail-label">Phonology profile</span>
              <h2>No phonology declared yet</h2>
            </div>
          </div>
          <p className="empty-state">Add phonology details to the language record to populate this panel.</p>
        </section>
      )}

      <section className="panel-card grammar-panel" aria-label="Grammar inventory">
        <div className="record-topline">
          <div>
            <span className="detail-label">Grammar inventory</span>
            <h2>{formatCount(grammarRules.length, "rule")}</h2>
          </div>
        </div>
        <div className="detail-list">
          {grammarRules.map((rule) => (
            <article className="detail-row grammar-rule-row" key={rule.id}>
              <div>
                <strong>{rule.topic}</strong>
                <p>{rule.explanation}</p>
              </div>
              <ConfidenceBadge confidence={rule.confidence} />
              <div className="pill-row">
                {rule.evidencePassageIds.map((passageId) => (
                  <span className="pill" key={passageId}>{passageId}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card vocabulary-panel" aria-label="Vocabulary inventory">
        <div className="record-topline">
          <div>
            <span className="detail-label">Vocabulary inventory</span>
            <h2>{formatCount(vocabulary.length, "entry", "entries")}</h2>
          </div>
        </div>
        <div className="vocabulary-grid">
          {vocabulary.map((item) => (
            <article className="vocabulary-entry" key={item.id}>
              <code>{item.form}</code>
              <strong>{item.gloss}</strong>
              <span>{item.partOfSpeech}</span>
              <div className="pill-row">
                {item.tags.map((tag) => (
                  <span className="pill" key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card morpheme-panel" aria-label="Morpheme inventory">
        <div className="record-topline">
          <div>
            <span className="detail-label">Morpheme inventory</span>
            <h2>{formatCount(morphemeInventory.length, "morpheme")}</h2>
          </div>
        </div>
        <div className="morpheme-grid">
          {morphemeInventory.map((item) => (
            <article className="morpheme-entry" key={`${item.surface}-${item.lemma}`}>
              <div className="morpheme-entry-topline">
                <code>{item.surface}</code>
                <span className="id-badge">{formatCount(item.occurrenceCount, "corpus use")}</span>
              </div>
              <strong>{item.lemma}</strong>
              <span>{item.glosses.join(" / ")}</span>
              {item.vocabulary && (
                <small>{item.vocabulary.partOfSpeech}: {item.vocabulary.gloss}</small>
              )}
              <div className="pill-row">
                {item.features.map((feature) => (
                  <span className="pill" key={`${item.surface}-${feature}`}>{feature}</span>
                ))}
              </div>
              <div className="pill-row">
                {item.passageIds.map((passageId) => (
                  <span className="pill" key={`${item.surface}-${passageId}`}>{passageId}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card paradigm-gaps-panel" aria-label="Paradigm gaps">
        <div className="record-topline">
          <div>
            <span className="detail-label">Paradigm gaps</span>
            <h2>{formatCount(paradigmGaps.length, "fieldwork to-do")}</h2>
          </div>
        </div>
        {paradigmGaps.length === 0 ? (
          <p className="empty-state">
            No paradigm gaps detected - or not enough attested cells to infer paradigms yet.
          </p>
        ) : (
          <div className="detail-list">
            {paradigmGaps.map((gap) => (
              <article className="detail-row paradigm-gap-row" key={`${gap.lemma}-${gap.dimension}`}>
                <div className="paradigm-gap-topline">
                  <code>{gap.lemma}</code>
                  <span className="paradigm-gap-dimension">{gap.dimension}</span>
                  <span className="id-badge">
                    {formatCount(gap.evidencePassageIds.length, "linked passage")}
                  </span>
                </div>
                <div className="pill-row">
                  {gap.attested.map((cell) => (
                    <span className="pill paradigm-cell-attested" key={`${gap.lemma}-attested-${cell}`}>{cell}</span>
                  ))}
                  {gap.missing.map((cell) => (
                    <span className="pill paradigm-cell-missing" key={`${gap.lemma}-missing-${cell}`}>
                      missing: {cell}
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
