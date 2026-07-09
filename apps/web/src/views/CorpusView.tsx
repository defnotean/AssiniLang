import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  fetchNeuralMap,
  validateCorpusBulk,
  validateCorpusImport,
  type CorpusBulkImportResponse,
  type CorpusImportPayload,
  type NeuralMapResponse
} from "../api";
import {
  buildCorpusImportPayload,
  canSubmitCorpusImportDraft,
  CORPUS_CONSENT_USE_VALUES,
  dryRunCorpusBulkImport,
  EMPTY_CORPUS_IMPORT_DRAFT,
  formatCorpusBulkDryRunReport,
  formatCorpusImportError,
  type CorpusImportDraft
} from "../corpusImport";
import { MorphChips } from "../components/MorphChips";
import { localizeApiError } from "../lib/format";
import type { CorpusPassage } from "../lib/types";
import { OPEN_CORPUS_BULK_EVENT } from "../lib/workspaceFocus";
import { useI18n, type MessageKey, type Translate } from "../i18n";

function formatServerBulkDryRunAppendix(response: CorpusBulkImportResponse, t: Translate): string {
  const summary = t("corpus.bulkServerDryRunSummary", {
    okCount: response.imported,
    failedCount: response.failed,
    total: response.results.length
  });
  const failures = response.results
    .filter((row): row is Extract<CorpusBulkImportResponse["results"][number], { ok: false }> => !row.ok)
    .map((row) => t("corpus.bulkServerDryRunRowError", {
      index: row.index + 1,
      detail: row.error
    }));
  if (failures.length === 0) {
    return summary;
  }
  return `${summary} ${failures.join(" ")}`;
}

export function CorpusView({
  languageId,
  corpus,
  isWorkflowBusy,
  onImportCorpusPassage,
  onImportCorpusBulk
}: {
  languageId?: string;
  corpus: CorpusPassage[];
  isWorkflowBusy: boolean;
  onImportCorpusPassage: (payload: CorpusImportPayload) => Promise<void>;
  onImportCorpusBulk: (passages: CorpusImportPayload[]) => Promise<CorpusBulkImportResponse>;
}) {
  const { t } = useI18n();
  const graphLanguageId = languageId ?? corpus[0]?.languageId ?? "";
  const [search, setSearch] = useState("");
  const [displayMode, setDisplayMode] = useState<"cards" | "interlinear" | "network">("cards");
  const [morphFilter, setMorphFilter] = useState<string | null>(null);
  const [graphState, setGraphState] = useState<
    { status: "idle" | "loading" } | { status: "ready"; data: NeuralMapResponse } | { status: "error"; message: string }
  >({ status: "idle" });
  const [importDraft, setImportDraft] = useState<CorpusImportDraft>(() => ({ ...EMPTY_CORPUS_IMPORT_DRAFT }));
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportingCorpus, setIsImportingCorpus] = useState(false);
  const [isValidatingCorpus, setIsValidatingCorpus] = useState(false);
  // Collapsed by default so the passage list gets the screen; the import form
  // is an occasional task while browsing is the everyday one.
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkPaste, setBulkPaste] = useState("");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isValidatingBulk, setIsValidatingBulk] = useState(false);
  const [isImportingBulk, setIsImportingBulk] = useState(false);
  const importFormRef = useRef<HTMLFormElement | null>(null);
  const bulkFormRef = useRef<HTMLDivElement | null>(null);
  const normalized = search.trim().toLowerCase();
  const isCorpusBusy = isImportingCorpus || isValidatingCorpus || isValidatingBulk || isImportingBulk;
  const canImportPassage = canSubmitCorpusImportDraft(importDraft)
    && !isWorkflowBusy
    && !isCorpusBusy;
  const canValidatePassage = canSubmitCorpusImportDraft(importDraft)
    && !isWorkflowBusy
    && !isCorpusBusy
    && Boolean(languageId);
  const canValidateBulk = bulkPaste.trim().length > 0
    && !isWorkflowBusy
    && !isCorpusBusy;
  const canImportBulk = bulkPaste.trim().length > 0
    && !isWorkflowBusy
    && !isCorpusBusy
    && Boolean(languageId);
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

  useEffect(() => {
    if (displayMode !== "network" || !graphLanguageId) return;

    let isCurrent = true;
    setGraphState({ status: "loading" });
    fetchNeuralMap(graphLanguageId)
      .then((data) => {
        if (isCurrent) setGraphState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setGraphState({
            status: "error",
            message: localizeApiError(error, t, "corpus.retryNetwork")
          });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [displayMode, graphLanguageId, t]);

  function toggleMorphFilter(surface: string) {
    setMorphFilter((current) => (current === surface ? null : surface));
  }

  function clearImportNotice() {
    setImportMessage(null);
    setImportError(null);
  }

  function clearBulkNotice() {
    setBulkMessage(null);
    setBulkError(null);
  }

  function openSingleImport() {
    setIsImportOpen(true);
    clearImportNotice();
    queueMicrotask(() => {
      importFormRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      document.getElementById("corpus-import-target")?.focus();
    });
  }

  function openBulkImport() {
    setIsBulkOpen(true);
    clearBulkNotice();
    queueMicrotask(() => {
      bulkFormRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      document.getElementById("corpus-bulk-paste")?.focus();
    });
  }

  useEffect(() => {
    function handleOpenBulkImport() {
      setIsBulkOpen(true);
      setBulkMessage(null);
      setBulkError(null);
    }
    window.addEventListener(OPEN_CORPUS_BULK_EVENT, handleOpenBulkImport);
    return () => window.removeEventListener(OPEN_CORPUS_BULK_EVENT, handleOpenBulkImport);
  }, []);

  function updateImportDraft(field: keyof CorpusImportDraft, value: string) {
    setImportDraft((current) => ({ ...current, [field]: value }));
    clearImportNotice();
  }

  function updateBulkPaste(value: string) {
    setBulkPaste(value);
    clearBulkNotice();
  }

  async function handleValidateCorpus() {
    const result = buildCorpusImportPayload(importDraft);
    if (!result.ok) {
      setImportMessage(null);
      setImportError(formatCorpusImportError(result.errorCode, t));
      return;
    }
    if (!languageId) {
      setImportMessage(null);
      setImportError(t("corpus.validateNoLanguage"));
      return;
    }

    setIsValidatingCorpus(true);
    setImportMessage(null);
    setImportError(null);
    try {
      const validation = await validateCorpusImport(languageId, result.payload);
      if (validation.ok) {
        const morphemeCount = validation.preview?.morphologicalSegmentation.length ?? 0;
        const tagCount = validation.preview?.topicTags.length ?? 0;
        const dryRunPrefix = t("corpus.validateDryRunNote");
        const success = validation.warnings.length > 0
          ? `${t("corpus.validateSuccess", { morphemeCount, tagCount })} ${validation.warnings.join(" ")}`
          : t("corpus.validateSuccess", { morphemeCount, tagCount });
        setImportMessage(`${dryRunPrefix} ${success}`);
      } else {
        setImportError(validation.errors.join(" "));
      }
    } catch (error) {
      setImportError(localizeApiError(error, t, "corpus.validateFailed"));
    } finally {
      setIsValidatingCorpus(false);
    }
  }

  async function handleImportCorpus(event: FormEvent) {
    event.preventDefault();
    const result = buildCorpusImportPayload(importDraft);
    if (!result.ok) {
      setImportMessage(null);
      setImportError(formatCorpusImportError(result.errorCode, t));
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
      setImportError(localizeApiError(error, t, "corpus.importFailed"));
    } finally {
      setIsImportingCorpus(false);
    }
  }

  async function handleValidateBulk() {
    const report = dryRunCorpusBulkImport(bulkPaste);
    const clientReport = formatCorpusBulkDryRunReport(report, t);
    const validPayloads = report.parseError
      ? []
      : report.rows
        .filter((row): row is Extract<typeof report.rows[number], { ok: true }> => row.ok)
        .map((row) => row.payload);

    if (report.parseError || validPayloads.length === 0) {
      setBulkMessage(null);
      setBulkError(clientReport);
      return;
    }

    if (!languageId) {
      setBulkMessage(clientReport);
      setBulkError(t("corpus.bulkValidateNoLanguage"));
      return;
    }

    setIsValidatingBulk(true);
    setBulkMessage(null);
    setBulkError(null);
    try {
      const serverValidation = await validateCorpusBulk(languageId, validPayloads);
      const serverAppendix = formatServerBulkDryRunAppendix(serverValidation, t);
      const combined = `${clientReport} ${serverAppendix}`;
      if (serverValidation.failed > 0) {
        setBulkMessage(null);
        setBulkError(combined);
      } else {
        setBulkMessage(combined);
      }
    } catch (error) {
      setBulkMessage(clientReport);
      setBulkError(localizeApiError(error, t, "corpus.bulkValidateFailed"));
    } finally {
      setIsValidatingBulk(false);
    }
  }

  async function handleImportBulk() {
    if (!languageId) {
      setBulkMessage(null);
      setBulkError(t("corpus.bulkValidateNoLanguage"));
      return;
    }

    const report = dryRunCorpusBulkImport(bulkPaste);
    const validPayloads = report.parseError
      ? []
      : report.rows
        .filter((row): row is Extract<typeof report.rows[number], { ok: true }> => row.ok)
        .map((row) => row.payload);

    if (validPayloads.length === 0) {
      setBulkMessage(null);
      setBulkError(t("corpus.bulkImportNoValidRows"));
      return;
    }

    setIsImportingBulk(true);
    setBulkMessage(null);
    setBulkError(null);
    try {
      const result = await onImportCorpusBulk(validPayloads);
      if (result.imported > 0 && result.failed === 0) {
        setBulkPaste("");
        setBulkMessage(t("corpus.bulkImportSuccess", { imported: result.imported }));
      } else if (result.imported > 0) {
        setBulkMessage(t("corpus.bulkImportPartial", {
          imported: result.imported,
          failed: result.failed
        }));
        const failureDetails = result.results
          .filter((row): row is Extract<typeof result.results[number], { ok: false }> => !row.ok)
          .map((row) => t("corpus.bulkServerDryRunRowError", {
            index: row.index + 1,
            detail: row.error
          }));
        if (failureDetails.length > 0) {
          setBulkError(failureDetails.join(" "));
        }
      } else {
        setBulkMessage(null);
        const failureDetails = result.results
          .filter((row): row is Extract<typeof result.results[number], { ok: false }> => !row.ok)
          .map((row) => t("corpus.bulkServerDryRunRowError", {
            index: row.index + 1,
            detail: row.error
          }));
        setBulkError([
          t("corpus.bulkImportNone", { failed: result.failed }),
          ...failureDetails
        ].join(" "));
      }
    } catch (error) {
      setBulkError(localizeApiError(error, t, "corpus.bulkImportFailed"));
    } finally {
      setIsImportingBulk(false);
    }
  }

  return (
    <div className="corpus-view">
      <form
        ref={importFormRef}
        className="record-card form-panel compact corpus-import-form"
        aria-label={t("corpus.importFormLabel")}
        onSubmit={handleImportCorpus}
      >
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
            <label htmlFor="corpus-import-consent-use">{t("corpus.consentUseLabel")}</label>
            <select
              id="corpus-import-consent-use"
              value={importDraft.consentUse}
              onChange={(event) => updateImportDraft("consentUse", event.target.value)}
            >
              {CORPUS_CONSENT_USE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`corpus.consentUse.${value}`)}
                </option>
              ))}
            </select>
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
          <div className="corpus-import-actions">
            <button
              type="button"
              className="secondary"
              aria-label={t("corpus.validatePassageAria")}
              aria-describedby="corpus-validate-dry-run-hint"
              disabled={!canValidatePassage}
              aria-busy={isValidatingCorpus}
              onClick={() => void handleValidateCorpus()}
            >
              {isValidatingCorpus ? t("corpus.validating") : t("corpus.validatePassage")}
            </button>
            <button
              type="submit"
              className="secondary"
              disabled={!canImportPassage}
              aria-busy={isImportingCorpus}
            >
              {isImportingCorpus ? t("corpus.importing") : t("corpus.importPassage")}
            </button>
          </div>
        )}
        {isImportOpen && (
          <p id="corpus-validate-dry-run-hint" className="inline-empty muted">
            {t("corpus.validateDryRunHint")}
          </p>
        )}
        {importMessage && <p className="result-notice" role="status" aria-live="polite">{importMessage}</p>}
        {importError && <p className="result-notice error" role="alert">{importError}</p>}
      </form>

      <div
        ref={bulkFormRef}
        className="record-card form-panel compact corpus-import-form"
        aria-label={t("corpus.bulkImportLabel")}
      >
        <button
          type="button"
          className="secondary corpus-import-toggle"
          aria-expanded={isBulkOpen}
          aria-controls="corpus-bulk-import-fields"
          onClick={() => setIsBulkOpen((current) => !current)}
        >
          <span>
            <span className="detail-label">{t("corpus.bulkImportLabel")}</span>
            <span className="corpus-import-toggle-title">{t("corpus.bulkImportTitle")}</span>
          </span>
          <span aria-hidden="true">{isBulkOpen ? t("corpus.hide") : t("corpus.open")}</span>
        </button>
        {isBulkOpen && (
          <div className="corpus-import-grid" id="corpus-bulk-import-fields">
            <div className="form-group wide">
              <label htmlFor="corpus-bulk-paste">{t("corpus.bulkPasteLabel")}</label>
              <textarea
                id="corpus-bulk-paste"
                value={bulkPaste}
                onChange={(event) => updateBulkPaste(event.target.value)}
                rows={8}
              />
            </div>
          </div>
        )}
        {isBulkOpen && (
          <div className="corpus-import-actions">
            <button
              type="button"
              className="secondary"
              aria-label={t("corpus.bulkValidateAria")}
              aria-describedby="corpus-bulk-dry-run-hint"
              disabled={!canValidateBulk}
              aria-busy={isValidatingBulk}
              onClick={() => void handleValidateBulk()}
            >
              {isValidatingBulk ? t("corpus.bulkValidating") : t("corpus.bulkValidate")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!canImportBulk}
              aria-busy={isImportingBulk}
              onClick={() => void handleImportBulk()}
            >
              {isImportingBulk ? t("corpus.bulkImporting") : t("corpus.bulkImport")}
            </button>
          </div>
        )}
        {isBulkOpen && (
          <p id="corpus-bulk-dry-run-hint" className="inline-empty muted">
            {t("corpus.bulkDryRunHint")}
          </p>
        )}
        {bulkMessage && <p className="result-notice" role="status" aria-live="polite">{bulkMessage}</p>}
        {bulkError && <p className="result-notice error" role="alert">{bulkError}</p>}
      </div>

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
          <button
            type="button"
            className={displayMode === "network" ? "active" : ""}
            aria-pressed={displayMode === "network"}
            onClick={() => setDisplayMode("network")}
          >
            {t("corpus.network")}
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

      <section className="corpus-list" aria-label={displayMode === "network" ? t("corpus.networkLabel") : t("corpus.passagesLabel")}>
        {displayMode === "network" ? (
          <CorpusGraph
            graphLanguageId={graphLanguageId}
            graphState={graphState}
            onOpenSingleImport={openSingleImport}
            onOpenBulkImport={openBulkImport}
            onRetry={() => {
              if (!graphLanguageId) return;
              setGraphState({ status: "loading" });
              fetchNeuralMap(graphLanguageId)
                .then((data) => setGraphState({ status: "ready", data }))
                .catch((error: unknown) => {
                  setGraphState({
                    status: "error",
                    message: localizeApiError(error, t, "corpus.retryNetwork")
                  });
                });
            }}
          />
        ) : visible.length === 0 ? (
          <p className="empty-state" role="status" aria-live="polite">
            {morphFilter
              ? t("corpus.emptyMorpheme")
              : corpus.length === 0
                ? t("corpus.emptyCorpus")
                : t("corpus.emptySearch")}
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
                  {passage.topicTags.map((tag, index) => (
                    <span className="pill" key={`${index}:${tag}`}>{tag}</span>
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

type GraphPoint = {
  id: string;
  x: number;
  y: number;
};

const GRAPH_NODE_LIMIT = 96;
const GRAPH_EDGE_LIMIT = 180;
const GRAPH_WIDTH = 920;
const GRAPH_HEIGHT = 540;
const GRAPH_ZOOM_STEP = 0.25;
const GRAPH_MIN_ZOOM = 0.75;
const GRAPH_MAX_ZOOM = 2;

const GRAPH_NODE_TYPE_PRIORITY: Record<string, number> = {
  language: 0,
  corpus: 1,
  morpheme: 2,
  topic_tag: 3,
  source_asset: 4,
  note: 5,
  exercise: 6,
  elder_correction: 7,
  ai_session: 8,
  output: 9
};

function compareGraphNodeTypes(left: string, right: string): number {
  const priorityDifference = (GRAPH_NODE_TYPE_PRIORITY[left] ?? 100) - (GRAPH_NODE_TYPE_PRIORITY[right] ?? 100);
  if (priorityDifference !== 0) return priorityDifference;
  return left < right ? -1 : left > right ? 1 : 0;
}

function selectCappedGraphNodes(nodes: NeuralMapResponse["nodes"]): NeuralMapResponse["nodes"] {
  return [...nodes]
    .sort((left, right) => {
      const typeDifference = compareGraphNodeTypes(left.type, right.type);
      if (typeDifference !== 0) return typeDifference;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    })
    .slice(0, GRAPH_NODE_LIMIT);
}

function graphNodeClass(type: string): string {
  if (type === "language") return "language";
  if (type === "corpus") return "corpus";
  if (type === "morpheme") return "morpheme";
  if (type === "topic_tag") return "topic";
  if (type === "source_asset") return "source";
  return "record";
}

const GRAPH_NODE_KIND_KEYS: Record<string, MessageKey> = {
  language: "corpus.networkKind.language",
  corpus: "corpus.networkKind.corpus",
  source_asset: "corpus.networkKind.source",
  morpheme: "corpus.networkKind.morpheme",
  topic_tag: "corpus.networkKind.topic",
  note: "corpus.networkKind.note",
  exercise: "corpus.networkKind.exercise",
  ai_session: "corpus.networkKind.session",
  elder_correction: "corpus.networkKind.correction",
  output: "corpus.networkKind.output"
};

function formatGraphNodeKind(type: string, t: Translate): string {
  const key = GRAPH_NODE_KIND_KEYS[type];
  return key ? t(key) : t("corpus.networkKind.record");
}

function truncateGraphLabel(value: string): string {
  return value.length > 28 ? `${value.slice(0, 25)}...` : value;
}

function buildGraphLayout(nodes: NeuralMapResponse["nodes"]): Map<string, GraphPoint> {
  const grouped = new Map<string, NeuralMapResponse["nodes"]>();
  for (const node of nodes) {
    grouped.set(node.type, [...(grouped.get(node.type) ?? []), node]);
  }

  const ringByType: Record<string, { radius: number; offset: number }> = {
    language: { radius: 0, offset: 0 },
    corpus: { radius: 120, offset: -Math.PI / 2 },
    morpheme: { radius: 205, offset: -Math.PI / 3 },
    topic_tag: { radius: 278, offset: Math.PI / 7 },
    source_asset: { radius: 278, offset: Math.PI },
    note: { radius: 232, offset: Math.PI / 2 },
    exercise: { radius: 320, offset: Math.PI / 5 },
    ai_session: { radius: 340, offset: Math.PI / 1.5 },
    elder_correction: { radius: 340, offset: Math.PI / 1.15 },
    output: { radius: 340, offset: 0 }
  };
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  const points = new Map<string, GraphPoint>();

  for (const [type, group] of grouped) {
    const ring = ringByType[type] ?? { radius: 330, offset: 0 };
    const count = group.length;
    group.forEach((node, index) => {
      const angle = ring.offset + (count === 1 ? 0 : (index / count) * Math.PI * 2);
      points.set(node.id, {
        id: node.id,
        x: centerX + Math.cos(angle) * ring.radius,
        y: centerY + Math.sin(angle) * ring.radius
      });
    });
  }

  return points;
}

function CorpusGraph({
  graphLanguageId,
  graphState,
  onRetry,
  onOpenSingleImport,
  onOpenBulkImport
}: {
  graphLanguageId: string;
  graphState: { status: "idle" | "loading" } | { status: "ready"; data: NeuralMapResponse } | { status: "error"; message: string };
  onRetry: () => void;
  onOpenSingleImport: () => void;
  onOpenBulkImport: () => void;
}) {
  const { t } = useI18n();
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const cappedGraph = useMemo(() => {
    if (graphState.status !== "ready") return null;
    const nodes = selectCappedGraphNodes(graphState.data.nodes);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graphState.data.edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .slice(0, GRAPH_EDGE_LIMIT);
    return { nodes, edges };
  }, [graphState]);
  const visibleGraph = useMemo(() => {
    if (!cappedGraph) return null;
    const nodes = cappedGraph.nodes.filter((node) => !hiddenNodeTypes.has(node.type));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = cappedGraph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    return { nodes, edges, points: buildGraphLayout(nodes) };
  }, [cappedGraph, hiddenNodeTypes]);
  const graphData = graphState.status === "ready" ? graphState.data : null;
  const cappedNodeCounts = (cappedGraph?.nodes ?? []).reduce<Record<string, number>>((counts, node) => {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
    return counts;
  }, {});
  const availableNodeTypes = Object.keys(cappedNodeCounts).sort(compareGraphNodeTypes);
  const selectedNode = selectedNodeId
    ? visibleGraph?.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const selectedRelationCount = selectedNode && visibleGraph
    ? visibleGraph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).length
    : 0;
  const viewBoxWidth = GRAPH_WIDTH / zoom;
  const viewBoxHeight = GRAPH_HEIGHT / zoom;
  const graphViewBox = [
    (GRAPH_WIDTH - viewBoxWidth) / 2,
    (GRAPH_HEIGHT - viewBoxHeight) / 2,
    viewBoxWidth,
    viewBoxHeight
  ].join(" ");

  function toggleNodeType(type: string) {
    setHiddenNodeTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  if (!graphLanguageId) {
    return (
      <div className="empty-state corpus-network-empty" role="status" aria-live="polite">
        <p>{t("corpus.noLanguageNetwork")}</p>
      </div>
    );
  }

  if (graphState.status === "idle" || graphState.status === "loading") {
    return (
      <div className="empty-state corpus-network-empty" role="status" aria-live="polite" aria-busy="true">
        <p>{t("corpus.loadingNetwork")}</p>
        <p className="muted">{t("corpus.loadingNetworkHint")}</p>
      </div>
    );
  }

  if (graphState.status === "error") {
    return (
      <div className="result-notice error corpus-network-empty" role="alert">
        <p>{graphState.message}</p>
        <p className="muted">{t("corpus.errorNetworkHint")}</p>
        <div className="practice-next-actions">
          <button type="button" className="secondary" onClick={onRetry}>
            {t("corpus.retryNetwork")}
          </button>
          <button type="button" className="secondary" onClick={onOpenSingleImport}>
            {t("corpus.emptyNetworkAddPassage")}
          </button>
          <button type="button" className="secondary" onClick={onOpenBulkImport}>
            {t("corpus.emptyNetworkAddBulk")}
          </button>
        </div>
      </div>
    );
  }

  if (!visibleGraph || !cappedGraph || !graphData || cappedGraph.nodes.length === 0) {
    return (
      <div className="empty-state corpus-network-empty" role="status" aria-live="polite">
        <p>{t("corpus.emptyNetwork")}</p>
        <p className="muted">{t("corpus.emptyNetworkHint")}</p>
        <div className="practice-next-actions">
          <button type="button" className="secondary" onClick={onOpenSingleImport}>
            {t("corpus.emptyNetworkAddPassage")}
          </button>
          <button type="button" className="secondary" onClick={onOpenBulkImport}>
            {t("corpus.emptyNetworkAddBulk")}
          </button>
        </div>
      </div>
    );
  }

  const insightItems = [
    { type: "corpus", label: t("corpus.networkInsight.passages") },
    { type: "morpheme", label: t("corpus.networkInsight.morphemes") },
    { type: "topic_tag", label: t("corpus.networkInsight.topics") },
    { type: "source_asset", label: t("corpus.networkInsight.sources") },
    { type: "note", label: t("corpus.networkInsight.notes") },
    { type: "exercise", label: t("corpus.networkInsight.exercises") },
    { type: "ai_session", label: t("corpus.networkInsight.sessions") },
    { type: "elder_correction", label: t("corpus.networkInsight.corrections") }
  ].map((item) => ({ ...item, count: cappedNodeCounts[item.type] ?? 0 }))
    .filter((item) => item.count > 0);
  const isLimited = graphData.nodes.length > cappedGraph.nodes.length
    || graphData.edges.length > cappedGraph.edges.length;

  const legendItems = [
    { kind: "language", label: t("corpus.networkKind.language") },
    { kind: "corpus", label: t("corpus.networkKind.corpus") },
    { kind: "source", label: t("corpus.networkKind.source") },
    { kind: "morpheme", label: t("corpus.networkKind.morpheme") },
    { kind: "topic", label: t("corpus.networkKind.topic") },
    { kind: "record", label: t("corpus.networkKind.record") }
  ];

  return (
    <div className="corpus-network-panel">
      <div className="corpus-network-summary">
        <span>{t("corpus.networkNodes", { count: visibleGraph.nodes.length })}</span>
        <span>{t("corpus.networkEdges", { count: visibleGraph.edges.length })}</span>
      </div>
      <fieldset className="corpus-network-filters">
        <legend>{t("corpus.networkFilters")}</legend>
        <div className="corpus-network-filter-options">
          {availableNodeTypes.map((type) => {
            const isVisible = !hiddenNodeTypes.has(type);
            const typeLabel = formatGraphNodeKind(type, t);
            return (
              <label className={`corpus-network-filter${isVisible ? "" : " muted"}`} key={type}>
                <input
                  type="checkbox"
                  checked={isVisible}
                  aria-label={t("corpus.networkFilterNodeType", {
                    type: typeLabel,
                    count: cappedNodeCounts[type]
                  })}
                  onChange={() => toggleNodeType(type)}
                />
                <i className={`network-dot ${graphNodeClass(type)}`} aria-hidden="true" />
                <span>{typeLabel}</span>
                <span className="corpus-network-filter-count">{cappedNodeCounts[type]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="corpus-network-insights" aria-label={t("corpus.networkInsights")}>
        {insightItems.map((item) => (
          <span className="corpus-network-insight" key={item.type}>
            <strong>{item.count}</strong>
            <span>{item.label}</span>
          </span>
        ))}
        {isLimited && (
          <span className="corpus-network-limit">
            {t("corpus.networkLimited", {
              nodes: cappedGraph.nodes.length,
              totalNodes: graphData.nodes.length,
              edges: cappedGraph.edges.length,
              totalEdges: graphData.edges.length
            })}
          </span>
        )}
      </div>
      <div className="corpus-network-canvas-header">
        <span className="corpus-network-zoom-level" aria-live="polite">
          {t("corpus.networkZoomLevel", { percent: Math.round(zoom * 100) })}
        </span>
        <div className="corpus-network-zoom-controls" role="group" aria-label={t("corpus.networkZoomControls")}>
          <button
            type="button"
            className="corpus-network-icon-button"
            aria-label={t("corpus.networkZoomOut")}
            title={t("corpus.networkZoomOut")}
            disabled={zoom <= GRAPH_MIN_ZOOM}
            onClick={() => setZoom((current) => Math.max(GRAPH_MIN_ZOOM, current - GRAPH_ZOOM_STEP))}
          >
            <span aria-hidden="true">-</span>
          </button>
          <button
            type="button"
            className="corpus-network-icon-button corpus-network-reset-button"
            aria-label={t("corpus.networkZoomReset")}
            title={t("corpus.networkZoomReset")}
            disabled={zoom === 1}
            onClick={() => setZoom(1)}
          >
            <span aria-hidden="true">1:1</span>
          </button>
          <button
            type="button"
            className="corpus-network-icon-button"
            aria-label={t("corpus.networkZoomIn")}
            title={t("corpus.networkZoomIn")}
            disabled={zoom >= GRAPH_MAX_ZOOM}
            onClick={() => setZoom((current) => Math.min(GRAPH_MAX_ZOOM, current + GRAPH_ZOOM_STEP))}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
      <div className="corpus-network-stage">
        <svg className="corpus-network-svg" viewBox={graphViewBox} role="img" aria-label={t("corpus.networkLabel")}>
          <g className="network-edges">
            {visibleGraph.edges.map((edge, index) => {
              const source = visibleGraph.points.get(edge.source);
              const target = visibleGraph.points.get(edge.target);
              if (!source || !target) return null;
              return (
                <line
                  key={`${edge.source}:${edge.target}:${edge.relation}:${index}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  data-relation={edge.relation}
                />
              );
            })}
          </g>
          <g className="network-nodes">
            {visibleGraph.nodes.map((node) => {
              const point = visibleGraph.points.get(node.id);
              if (!point) return null;
              const typeLabel = formatGraphNodeKind(node.type, t);
              const connectedRelationCount = visibleGraph.edges.filter(
                (edge) => edge.source === node.id || edge.target === node.id
              ).length;
              const isSelected = node.id === selectedNode?.id;
              return (
                <g
                  key={node.id}
                  className={`network-node ${graphNodeClass(node.type)}${isSelected ? " selected" : ""}`}
                  transform={`translate(${point.x} ${point.y})`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={t("corpus.networkNodeAria", {
                    type: typeLabel,
                    label: node.label,
                    count: connectedRelationCount
                  })}
                  data-node-id={node.id}
                  data-node-type={node.type}
                  onClick={() => setSelectedNodeId(node.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedNodeId(node.id);
                  }}
                >
                  <circle r={node.type === "language" ? 18 : node.type === "corpus" ? 12 : 9} />
                  <text y={node.type === "language" ? -24 : -15}>{truncateGraphLabel(node.label)}</text>
                  <title>{t("corpus.networkNodeTitle", { type: typeLabel, label: node.label })}</title>
                </g>
              );
            })}
          </g>
        </svg>
        {visibleGraph.nodes.length === 0 && (
          <p className="corpus-network-filter-empty" role="status">
            {t("corpus.networkFilterEmpty")}
          </p>
        )}
      </div>
      <aside className="corpus-network-detail" aria-label={t("corpus.networkDetails")} aria-live="polite">
        <span className="detail-label">{t("corpus.networkDetails")}</span>
        {selectedNode ? (
          <dl>
            <div>
              <dt>{t("corpus.networkDetailLabel")}</dt>
              <dd>{selectedNode.label}</dd>
            </div>
            <div>
              <dt>{t("corpus.networkDetailType")}</dt>
              <dd>{formatGraphNodeKind(selectedNode.type, t)}</dd>
            </div>
            <div>
              <dt>{t("corpus.networkDetailId")}</dt>
              <dd>{selectedNode.id}</dd>
            </div>
            <div>
              <dt>{t("corpus.networkDetailRelations")}</dt>
              <dd>{selectedRelationCount}</dd>
            </div>
          </dl>
        ) : (
          <p>{t("corpus.networkSelectNode")}</p>
        )}
      </aside>
      <div className="corpus-network-legend" aria-label={t("corpus.networkLegend")}>
        {legendItems.map((item) => (
          <span key={item.kind}><i className={`network-dot ${item.kind}`} />{item.label}</span>
        ))}
      </div>
    </div>
  );
}
