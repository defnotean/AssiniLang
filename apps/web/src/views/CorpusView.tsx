import { useMemo, useState, type FormEvent } from "react";
import type { CorpusImportPayload } from "../api";
import {
  buildCorpusImportPayload,
  canSubmitCorpusImportDraft,
  EMPTY_CORPUS_IMPORT_DRAFT,
  type CorpusImportDraft
} from "../corpusImport";
import { MorphChips } from "../components/MorphChips";
import type { CorpusPassage } from "../lib/types";
import { useI18n } from "../i18n";

export function CorpusView({
  corpus,
  isWorkflowBusy,
  onImportCorpusPassage
}: {
  corpus: CorpusPassage[];
  isWorkflowBusy: boolean;
  onImportCorpusPassage: (payload: CorpusImportPayload) => Promise<void>;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [displayMode, setDisplayMode] = useState<"cards" | "interlinear">("cards");
  const [morphFilter, setMorphFilter] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState<CorpusImportDraft>(() => ({ ...EMPTY_CORPUS_IMPORT_DRAFT }));
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportingCorpus, setIsImportingCorpus] = useState(false);
  // Collapsed by default so the passage list gets the screen; the import form
  // is an occasional task while browsing is the everyday one.
  const [isImportOpen, setIsImportOpen] = useState(false);
  const normalized = search.trim().toLowerCase();
  const canImportPassage = canSubmitCorpusImportDraft(importDraft)
    && !isWorkflowBusy
    && !isImportingCorpus;
  const filtered = useMemo(() => {
    if (!normalized) return corpus;
    return corpus.filter((passage) => {
      const morphemeText = passage.morphologicalSegmentation
        .map((morpheme) => `${morpheme.surface} ${morpheme.gloss} ${morpheme.lemma} ${morpheme.features.join(" ")}`)
        .join(" ");
      return [
        passage.id,
        passage.source,
        passage.textTarget,
        passage.textTranslation,
        passage.topicTags.join(" "),
        morphemeText
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [corpus, normalized]);

  const visible = useMemo(() => {
    if (!morphFilter) return filtered;
    return filtered.filter((passage) =>
      passage.morphologicalSegmentation.some((morpheme) => morpheme.surface === morphFilter)
    );
  }, [filtered, morphFilter]);

  function toggleMorphFilter(surface: string) {
    setMorphFilter((current) => (current === surface ? null : surface));
  }

  function clearImportNotice() {
    setImportMessage(null);
    setImportError(null);
  }

  function updateImportDraft(field: keyof CorpusImportDraft, value: string) {
    setImportDraft((current) => ({ ...current, [field]: value }));
    clearImportNotice();
  }

  async function handleImportCorpus(event: FormEvent) {
    event.preventDefault();
    const result = buildCorpusImportPayload(importDraft);
    if (!result.ok) {
      setImportMessage(null);
      setImportError(result.error);
      return;
    }

    setIsImportingCorpus(true);
    setImportMessage(null);
    setImportError(null);
    try {
      await onImportCorpusPassage(result.payload);
      setImportDraft({ ...EMPTY_CORPUS_IMPORT_DRAFT });
      setImportMessage(t("corpus.importSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("corpus.importFailed");
      setImportError(message);
    } finally {
      setIsImportingCorpus(false);
    }
  }

  return (
    <div className="corpus-view">
      <form className="record-card form-panel compact corpus-import-form" aria-label={t("corpus.importFormLabel")} onSubmit={handleImportCorpus}>
        <button
          type="button"
          className="secondary corpus-import-toggle"
          aria-expanded={isImportOpen}
          aria-controls="corpus-import-fields"
          onClick={() => setIsImportOpen((current) => !current)}
        >
          <span>
            <span className="detail-label">{t("corpus.importLabel")}</span>
            <span className="corpus-import-toggle-title">{t("corpus.addSourcePassage")}</span>
          </span>
          <span aria-hidden="true">{isImportOpen ? t("corpus.hide") : t("corpus.open")}</span>
        </button>
        {isImportOpen && (
        <div className="corpus-import-grid" id="corpus-import-fields">
          <div className="form-group wide">
            <label htmlFor="corpus-import-target">{t("corpus.targetTextLabel")}</label>
            <input
              id="corpus-import-target"
              value={importDraft.target}
              onChange={(event) => updateImportDraft("target", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-translation">{t("corpus.translationLabel")}</label>
            <input
              id="corpus-import-translation"
              value={importDraft.translation}
              onChange={(event) => updateImportDraft("translation", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-source">{t("corpus.sourceLabel")}</label>
            <input
              id="corpus-import-source"
              value={importDraft.source}
              onChange={(event) => updateImportDraft("source", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-author">{t("corpus.authorLabel")}</label>
            <input
              id="corpus-import-author"
              value={importDraft.author}
              onChange={(event) => updateImportDraft("author", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-year">{t("corpus.yearLabel")}</label>
            <input
              id="corpus-import-year"
              type="number"
              inputMode="numeric"
              value={importDraft.year}
              onChange={(event) => updateImportDraft("year", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-license">{t("corpus.licenseLabel")}</label>
            <input
              id="corpus-import-license"
              value={importDraft.license}
              onChange={(event) => updateImportDraft("license", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-consent-record">{t("corpus.consentRecordLabel")}</label>
            <input
              id="corpus-import-consent-record"
              value={importDraft.consentRecord}
              onChange={(event) => updateImportDraft("consentRecord", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-tags">{t("corpus.topicTagsLabel")}</label>
            <input
              id="corpus-import-tags"
              value={importDraft.tags}
              onChange={(event) => updateImportDraft("tags", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-morphemes">{t("corpus.morphemeSegmentationLabel")}</label>
            <textarea
              id="corpus-import-morphemes"
              value={importDraft.morphemes}
              onChange={(event) => updateImportDraft("morphemes", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-restrictions">{t("corpus.accessRestrictionsLabel")}</label>
            <input
              id="corpus-import-restrictions"
              value={importDraft.restrictions}
              onChange={(event) => updateImportDraft("restrictions", event.target.value)}
            />
          </div>
        </div>
        )}
        {isImportOpen && (
          <button type="submit" className="secondary" disabled={!canImportPassage}>
            {isImportingCorpus ? t("corpus.importing") : t("corpus.importPassage")}
          </button>
        )}
        {importMessage && <p className="result-notice" role="status" aria-live="polite">{importMessage}</p>}
        {importError && <p className="result-notice error" role="alert">{importError}</p>}
      </form>

      <div className="toolbar-row">
        <label className="search-field" htmlFor="corpus-search">
          <span className="visually-hidden">{t("corpus.searchLabel")}</span>
          <input
            id="corpus-search"
            type="search"
            aria-label={t("corpus.searchLabel")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("corpus.searchPlaceholder")}
          />
        </label>
        <div className="display-mode-toggle" role="group" aria-label={t("corpus.displayModeLabel")}>
          <button
            type="button"
            className={displayMode === "cards" ? "active" : ""}
            aria-pressed={displayMode === "cards"}
            onClick={() => setDisplayMode("cards")}
          >
            {t("corpus.cards")}
          </button>
          <button
            type="button"
            className={displayMode === "interlinear" ? "active" : ""}
            aria-pressed={displayMode === "interlinear"}
            onClick={() => setDisplayMode("interlinear")}
          >
            {t("corpus.interlinear")}
          </button>
        </div>
        <span className="record-count">{t("corpus.passageCount", { visible: visible.length, total: corpus.length })}</span>
      </div>

      {morphFilter && (
        <div className="active-filter-row">
          <span className="active-filter-pill">
            <span>{t("corpus.morphemeFilter", { morpheme: morphFilter })}</span>
            <button
              type="button"
              aria-label={t("corpus.clearMorphemeFilter", { morpheme: morphFilter })}
              onClick={() => setMorphFilter(null)}
            >
              ×
            </button>
          </span>
          <span className="record-count" role="status" aria-live="polite">
            {visible.length === 1
              ? t("corpus.passagesContainingOne", { count: visible.length, morpheme: morphFilter })
              : t("corpus.passagesContainingOther", { count: visible.length, morpheme: morphFilter })}
          </span>
        </div>
      )}

      <section className="corpus-list" aria-label={t("corpus.passagesLabel")}>
        {visible.length === 0 ? (
          <p className="empty-state">
            {morphFilter ? t("corpus.emptyMorpheme") : t("corpus.emptySearch")}
          </p>
        ) : displayMode === "interlinear" ? (
          visible.map((passage) => (
            <article className="igt-passage" key={passage.id}>
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
                      onClick={() => toggleMorphFilter(morpheme.surface)}
                    >
                      <span className="igt-surface">{morpheme.surface}</span>
                      <span className="igt-gloss">{morpheme.gloss}</span>
                    </button>
                  );
                })}
              </div>
              <p className="igt-translation">{passage.textTranslation}</p>
            </article>
          ))
        ) : (
          visible.map((passage) => (
            <article className="corpus-card" key={passage.id}>
              <div className="bead-strip" aria-hidden="true" />
              <div className="corpus-card-body">
                <div className="corpus-topline">
                  <code>{passage.textTarget}</code>
                  <span className="id-badge">{passage.id}</span>
                </div>
                <p className="translation">{passage.textTranslation}</p>
                <MorphChips
                  morphemes={passage.morphologicalSegmentation}
                  onSelect={toggleMorphFilter}
                  activeSurface={morphFilter}
                />
                <div className="pill-row">
                  {passage.topicTags.map((tag) => (
                    <span className="pill" key={tag}>{tag}</span>
                  ))}
                  <span className="pill">{passage.source}</span>
                  <span className="pill">{passage.consentStatus.use}</span>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
