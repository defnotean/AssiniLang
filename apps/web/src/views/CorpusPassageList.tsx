import { MorphChips } from "../components/MorphChips";
import type { CorpusPassage } from "../lib/types";
import type { Translate } from "../i18n";

type CorpusPassageListProps = {
  corpusCount: number;
  displayMode: "cards" | "interlinear";
  morphFilter: string | null;
  onToggleMorphFilter: (surface: string) => void;
  passages: CorpusPassage[];
  t: Translate;
};

export function CorpusPassageList({
  corpusCount,
  displayMode,
  morphFilter,
  onToggleMorphFilter,
  passages,
  t
}: CorpusPassageListProps) {
  if (passages.length === 0) {
    return (
      <p className="empty-state" role="status" aria-live="polite">
        {morphFilter
          ? t("corpus.emptyMorpheme")
          : corpusCount === 0
            ? t("corpus.emptyCorpus")
            : t("corpus.emptySearch")}
      </p>
    );
  }

  if (displayMode === "interlinear") {
    return passages.map((passage) => (
      <article className="igt-passage corpus-render-row" key={passage.id}>
        <div className="igt-topline">
          <span className="id-badge">{passage.id}</span>
          <span className="pill">{passage.source}</span>
        </div>
        <div className="igt-line">
          {passage.morphologicalSegmentation.map((morpheme, index) => {
            const isActive = morphFilter === morpheme.surface;
            return (
              <button
                type="button"
                className={`igt-word${isActive ? " active" : ""}`}
                key={`${morpheme.surface}-${morpheme.gloss}-${index}`}
                aria-pressed={isActive}
                onClick={() => onToggleMorphFilter(morpheme.surface)}
              >
                <span className="igt-surface">{morpheme.surface}</span>
                <span className="igt-gloss">{morpheme.gloss}</span>
              </button>
            );
          })}
        </div>
        <p className="igt-translation">{passage.textTranslation}</p>
      </article>
    ));
  }

  return passages.map((passage) => (
    <article className="corpus-card corpus-render-row" key={passage.id}>
      <div className="bead-strip" aria-hidden="true" />
      <div className="corpus-card-body">
        <div className="corpus-topline">
          <code>{passage.textTarget}</code>
          <span className="id-badge">{passage.id}</span>
        </div>
        <p className="translation">{passage.textTranslation}</p>
        <MorphChips
          morphemes={passage.morphologicalSegmentation}
          onSelect={onToggleMorphFilter}
          activeSurface={morphFilter}
        />
        <div className="pill-row">
          {passage.topicTags.map((tag, index) => (
            <span className="pill" key={`${index}:${tag}`}>
              {tag}
            </span>
          ))}
          <span className="pill">{passage.source}</span>
          <span className="pill">{passage.consentStatus.use}</span>
        </div>
      </div>
    </article>
  ));
}
