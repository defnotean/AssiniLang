import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { fetchNeuralMap, type NeuralMapResponse } from "../api/aiSessionApi";
import {
  validateCorpusBulk,
  validateCorpusImport,
  type CorpusBulkImportResponse,
  type CorpusImportPayload
} from "../api/studyApi";
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
import { localizeApiError } from "../lib/format";
import type { CorpusPassage } from "../lib/types";
import { OPEN_CORPUS_BULK_EVENT } from "../lib/workspaceFocus";
import { useI18n, type Translate } from "../i18n";
import { CorpusGraph } from "./CorpusGraph";
import { CorpusImportPanels } from "./CorpusImportPanels";
import { CorpusPassageList } from "./CorpusPassageList";

function formatServerBulkDryRunAppendix(response: CorpusBulkImportResponse, t: Translate): string {
  const summary = t("corpus.bulkServerDryRunSummary", {
    okCount: response.imported,
    failedCount: response.failed,
    total: response.results.length
  });
  const failures = response.results
    .filter((row): row is Extract<CorpusBulkImportResponse["results"][number], { ok: false }> => !row.ok)
    .map((row) =>
      t("corpus.bulkServerDryRunRowError", {
        index: row.index + 1,
        detail: row.error
      })
    );
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
  const isNetworkMode = displayMode === "network";
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
  const canImportPassage = canSubmitCorpusImportDraft(importDraft) && !isWorkflowBusy && !isCorpusBusy;
  const canValidatePassage =
    canSubmitCorpusImportDraft(importDraft) && !isWorkflowBusy && !isCorpusBusy && Boolean(languageId);
  const canValidateBulk = bulkPaste.trim().length > 0 && !isWorkflowBusy && !isCorpusBusy;
  const canImportBulk = bulkPaste.trim().length > 0 && !isWorkflowBusy && !isCorpusBusy && Boolean(languageId);
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
    if (!isNetworkMode || !graphLanguageId) return;

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
  }, [isNetworkMode, graphLanguageId, t]);

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
        const success =
          validation.warnings.length > 0
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
          .filter((row): row is Extract<(typeof report.rows)[number], { ok: true }> => row.ok)
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
          .filter((row): row is Extract<(typeof report.rows)[number], { ok: true }> => row.ok)
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
        setBulkMessage(
          t("corpus.bulkImportPartial", {
            imported: result.imported,
            failed: result.failed
          })
        );
        const failureDetails = result.results
          .filter((row): row is Extract<(typeof result.results)[number], { ok: false }> => !row.ok)
          .map((row) =>
            t("corpus.bulkServerDryRunRowError", {
              index: row.index + 1,
              detail: row.error
            })
          );
        if (failureDetails.length > 0) {
          setBulkError(failureDetails.join(" "));
        }
      } else {
        setBulkMessage(null);
        const failureDetails = result.results
          .filter((row): row is Extract<(typeof result.results)[number], { ok: false }> => !row.ok)
          .map((row) =>
            t("corpus.bulkServerDryRunRowError", {
              index: row.index + 1,
              detail: row.error
            })
          );
        setBulkError([t("corpus.bulkImportNone", { failed: result.failed }), ...failureDetails].join(" "));
      }
    } catch (error) {
      setBulkError(localizeApiError(error, t, "corpus.bulkImportFailed"));
    } finally {
      setIsImportingBulk(false);
    }
  }

  return (
    <div className="corpus-view">
      <CorpusImportPanels
        bulkError={bulkError}
        bulkFormRef={bulkFormRef}
        bulkMessage={bulkMessage}
        bulkPaste={bulkPaste}
        canImportBulk={canImportBulk}
        canImportPassage={canImportPassage}
        canValidateBulk={canValidateBulk}
        canValidatePassage={canValidatePassage}
        handleImportBulk={handleImportBulk}
        handleImportCorpus={handleImportCorpus}
        handleValidateBulk={handleValidateBulk}
        handleValidateCorpus={handleValidateCorpus}
        importDraft={importDraft}
        importError={importError}
        importFormRef={importFormRef}
        importMessage={importMessage}
        isBulkOpen={isBulkOpen}
        isImportOpen={isImportOpen}
        isImportingBulk={isImportingBulk}
        isImportingCorpus={isImportingCorpus}
        isValidatingBulk={isValidatingBulk}
        isValidatingCorpus={isValidatingCorpus}
        setIsBulkOpen={setIsBulkOpen}
        setIsImportOpen={setIsImportOpen}
        t={t}
        updateBulkPaste={updateBulkPaste}
        updateImportDraft={updateImportDraft}
      />
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
        <span className="record-count">
          {t("corpus.passageCount", { visible: visible.length, total: corpus.length })}
        </span>
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

      <section
        className="corpus-list"
        aria-label={isNetworkMode ? t("corpus.networkLabel") : t("corpus.passagesLabel")}
      >
        {isNetworkMode ? (
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
        ) : (
          <CorpusPassageList
            corpusCount={corpus.length}
            displayMode={displayMode}
            morphFilter={morphFilter}
            onToggleMorphFilter={toggleMorphFilter}
            passages={visible}
            t={t}
          />
        )}
      </section>
    </div>
  );
}
