import { useEffect, useState, type FormEvent } from "react";
import {
  acceptExtractionDraft,
  bulkReviewExtractionDrafts,
  fetchExtractionDrafts,
  fetchSources,
  processSource,
  registerSource,
  rejectExtractionDraft,
  uploadSourceFile
} from "../api";
import type { BulkReviewAction, ExtractionDraftView, SourceAsset, SourceRegistrationPayload } from "../api";
import { ConfidenceBadge, StatusBadge } from "../components/badges";
import { extractionDraftSummary, formatCount } from "../lib/format";
import { useI18n } from "../i18n";

export function IngestView({ languageId }: { languageId: string }) {
  const { t } = useI18n();
  const [sources, setSources] = useState<SourceAsset[]>([]);
  const [drafts, setDrafts] = useState<ExtractionDraftView[]>([]);
  const [isLoadingIntake, setIsLoadingIntake] = useState(true);
  const [intakeError, setIntakeError] = useState<string | null>(null);

  const [registerKind, setRegisterKind] = useState<SourceRegistrationPayload["kind"]>("text");
  const [registerTitle, setRegisterTitle] = useState("");
  const [registerText, setRegisterText] = useState("");
  const [registerUrl, setRegisterUrl] = useState("");
  const [registerNotice, setRegisterNotice] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegisteringSource, setIsRegisteringSource] = useState(false);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadingSource, setIsUploadingSource] = useState(false);

  const [processingSourceId, setProcessingSourceId] = useState<string | null>(null);
  const [pollingSource, setPollingSource] = useState<{ id: string; title: string } | null>(null);
  const [processNotice, setProcessNotice] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processWarnings, setProcessWarnings] = useState<string[]>([]);

  const [reviewingDraftId, setReviewingDraftId] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkReviewAction | null>(null);
  const [isBulkReviewing, setIsBulkReviewing] = useState(false);
  const [bulkFailures, setBulkFailures] = useState<{ draftId: string; error: string }[]>([]);

  useEffect(() => {
    let isCurrent = true;
    setIsLoadingIntake(true);
    setIntakeError(null);
    setRegisterNotice(null);
    setRegisterError(null);
    setProcessingSourceId(null);
    setPollingSource(null);
    setProcessNotice(null);
    setProcessError(null);
    setProcessWarnings([]);
    setDraftNotice(null);
    setDraftError(null);
    setSelectedDraftIds([]);
    setPendingBulkAction(null);
    setBulkFailures([]);

    Promise.all([fetchSources(languageId), fetchExtractionDrafts(languageId, "proposed")])
      .then(([loadedSources, loadedDrafts]) => {
        if (!isCurrent) return;
        setSources(loadedSources);
        setDrafts(loadedDrafts);
      })
      .catch((error: Error) => {
        if (isCurrent) setIntakeError(error.message);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingIntake(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [languageId]);

  async function refreshIntake() {
    const [loadedSources, loadedDrafts] = await Promise.all([
      fetchSources(languageId),
      fetchExtractionDrafts(languageId, "proposed")
    ]);
    setSources(loadedSources);
    setDrafts(loadedDrafts);
    setSelectedDraftIds((previous) => previous.filter((id) => loadedDrafts.some((draft) => draft.id === id)));
  }

  async function handleRegisterSource(event: FormEvent) {
    event.preventDefault();
    const title = registerTitle.trim();
    const rawText = registerText.trim();
    const url = registerUrl.trim();

    if (!title) {
      setRegisterNotice(null);
      setRegisterError(t("ingest.errorTitleRequired"));
      return;
    }

    if (registerKind === "url" ? !url : !rawText) {
      setRegisterNotice(null);
      setRegisterError(registerKind === "url" ? t("ingest.errorUrlRequired") : t("ingest.errorTextRequired"));
      return;
    }

    const payload: SourceRegistrationPayload = registerKind === "url"
      ? { kind: registerKind, title, url }
      : { kind: registerKind, title, rawText };

    setIsRegisteringSource(true);
    setRegisterNotice(null);
    setRegisterError(null);
    try {
      const registered = await registerSource(languageId, payload);
      setRegisterTitle("");
      setRegisterText("");
      setRegisterUrl("");
      setRegisterNotice(t("ingest.sourceRegistered", { title: registered.title }));
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("ingest.sourceRegistrationFailed");
      setRegisterError(message);
    } finally {
      setIsRegisteringSource(false);
    }
  }

  async function handleUploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!uploadFile) {
      setRegisterNotice(null);
      setRegisterError(t("ingest.errorChooseFile"));
      return;
    }

    setIsUploadingSource(true);
    setRegisterNotice(null);
    setRegisterError(null);
    try {
      const uploaded = await uploadSourceFile(languageId, uploadFile, uploadTitle.trim() || undefined);
      setUploadFile(null);
      setUploadTitle("");
      form.reset();
      setRegisterNotice(t("ingest.fileUploaded", { kind: uploaded.kind, title: uploaded.title }));
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("ingest.sourceUploadFailed");
      setRegisterError(message);
    } finally {
      setIsUploadingSource(false);
    }
  }

  // Poll the source list while a background extraction is running. The
  // first poll fires immediately, then every 2.5s until the asset leaves
  // "processing"; cleanup cancels the loop on unmount or language change.
  useEffect(() => {
    if (!pollingSource) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const loadedSources = await fetchSources(languageId);
        if (cancelled) return;
        setSources(loadedSources);

        const asset = loadedSources.find((item) => item.id === pollingSource.id);
        if (asset && asset.status === "processing") {
          timer = setTimeout(() => { void poll(); }, 2500);
          return;
        }

        setPollingSource(null);
        setProcessingSourceId(null);
        if (asset && asset.status === "failed") {
          setProcessError(asset.error ?? t("ingest.processingFailed", { title: pollingSource.title }));
        } else {
          setProcessNotice(t("ingest.processingFinished", { title: pollingSource.title }));
        }

        const loadedDrafts = await fetchExtractionDrafts(languageId, "proposed");
        if (!cancelled) setDrafts(loadedDrafts);
      } catch {
        // Transient fetch failure: keep polling instead of giving up.
        if (!cancelled) {
          timer = setTimeout(() => { void poll(); }, 2500);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [pollingSource, languageId]);

  async function handleProcessSource(sourceId: string) {
    setProcessingSourceId(sourceId);
    setProcessNotice(null);
    setProcessError(null);
    setProcessWarnings([]);
    try {
      const result = await processSource(sourceId, { async: true });
      setSources((previous) => previous.map((item) => (item.id === result.asset.id ? result.asset : item)));
      setPollingSource({ id: result.asset.id, title: result.asset.title });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("ingest.sourceProcessingFailed");
      setProcessError(message);
      setProcessingSourceId(null);
    }
  }

  async function handleDraftDecision(draftId: string, decision: "accept" | "reject") {
    setReviewingDraftId(draftId);
    setDraftNotice(null);
    setDraftError(null);
    try {
      if (decision === "accept") {
        const result = await acceptExtractionDraft(draftId);
        setDraftNotice(t("ingest.draftAccepted", { label: t(`draftKind.${result.draft.kind}`) }));
      } else {
        const rejected = await rejectExtractionDraft(draftId);
        setDraftNotice(t("ingest.draftRejected", { label: t(`draftKind.${rejected.kind}`) }));
      }
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("ingest.draftReviewFailed");
      setDraftError(message);
    } finally {
      setReviewingDraftId(null);
    }
  }

  function toggleDraftSelection(draftId: string) {
    setPendingBulkAction(null);
    setSelectedDraftIds((previous) =>
      previous.includes(draftId) ? previous.filter((id) => id !== draftId) : [...previous, draftId]
    );
  }

  function toggleSelectAllProposed() {
    setPendingBulkAction(null);
    setSelectedDraftIds((previous) => (previous.length === drafts.length ? [] : drafts.map((draft) => draft.id)));
  }

  async function handleBulkReview(action: BulkReviewAction) {
    // Two-click confirm: the first click arms the action, the second runs it.
    if (pendingBulkAction !== action) {
      setPendingBulkAction(action);
      return;
    }

    setPendingBulkAction(null);
    setIsBulkReviewing(true);
    setDraftNotice(null);
    setDraftError(null);
    setBulkFailures([]);
    try {
      const result = await bulkReviewExtractionDrafts(languageId, action, selectedDraftIds);
      const succeeded = action === "accept" ? result.accepted : result.rejected;
      const verb = action === "accept" ? t("ingest.bulkVerbAccepted") : t("ingest.bulkVerbRejected");
      const summary = t("ingest.bulkReviewFinished", { succeeded, verb, failed: result.failed });
      if (result.failed > 0) {
        setDraftError(summary);
        setBulkFailures(
          result.results
            .filter((item) => !item.ok)
            .map((item) => ({ draftId: item.draftId, error: item.error ?? t("ingest.unknownFailure") }))
        );
      } else {
        setDraftNotice(summary);
      }
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("ingest.bulkReviewFailed");
      setDraftError(message);
    } finally {
      setIsBulkReviewing(false);
    }
  }

  if (isLoadingIntake) {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        {t("ingest.loadingIntake")}
      </div>
    );
  }

  if (intakeError) {
    return (
      <div className="panel-card error" role="alert">
        {intakeError}
      </div>
    );
  }

  return (
    <div className="ingest-view">
      <form className="record-card form-panel compact" aria-label={t("ingest.registerSourceAria")} onSubmit={handleRegisterSource}>
        <div>
          <span className="detail-label">{t("ingest.sourceIntake")}</span>
          <h3>{t("ingest.addSource")}</h3>
        </div>
        {registerNotice && <p className="result-notice" role="status" aria-live="polite">{registerNotice}</p>}
        {registerError && <p className="result-notice error" role="alert">{registerError}</p>}
        <div className="form-group">
          <label htmlFor="ingest-source-kind">{t("ingest.sourceKind")}</label>
          <select
            id="ingest-source-kind"
            value={registerKind}
            onChange={(event) => setRegisterKind(event.target.value as SourceRegistrationPayload["kind"])}
          >
            <option value="text">{t("ingest.sourceKindText")}</option>
            <option value="wordlist">{t("ingest.sourceKindWordlist")}</option>
            <option value="url">{t("ingest.sourceKindUrl")}</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="ingest-source-title">{t("ingest.sourceTitle")}</label>
          <input id="ingest-source-title" value={registerTitle} onChange={(event) => setRegisterTitle(event.target.value)} />
        </div>
        {registerKind === "url" ? (
          <div className="form-group">
            <label htmlFor="ingest-source-url">{t("ingest.sourceUrl")}</label>
            <input
              id="ingest-source-url"
              type="url"
              value={registerUrl}
              onChange={(event) => setRegisterUrl(event.target.value)}
              placeholder={t("ingest.sourceUrlPlaceholder")}
            />
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="ingest-source-text">{t("ingest.rawText")}</label>
            <textarea
              id="ingest-source-text"
              value={registerText}
              onChange={(event) => setRegisterText(event.target.value)}
              placeholder={t("ingest.rawTextPlaceholder")}
            />
          </div>
        )}
        <button type="submit" className="secondary" disabled={isRegisteringSource}>
          {isRegisteringSource ? t("ingest.registering") : t("ingest.registerSource")}
        </button>
      </form>

      <form className="record-card form-panel compact" aria-label={t("ingest.uploadSourceFileAria")} onSubmit={handleUploadSource}>
        <div>
          <span className="detail-label">{t("ingest.fileIntake")}</span>
          <h3>{t("ingest.uploadHeading")}</h3>
        </div>
        <div className="form-group">
          <label htmlFor="ingest-upload-title">{t("ingest.uploadTitle")}</label>
          <input id="ingest-upload-title" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="ingest-upload-file">{t("ingest.sourceFile")}</label>
          <input
            id="ingest-upload-file"
            type="file"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <button type="submit" className="secondary" disabled={isUploadingSource || !uploadFile}>
          {isUploadingSource ? t("ingest.uploading") : t("ingest.uploadSourceFile")}
        </button>
      </form>

      <section className="panel-card" aria-label={t("ingest.registeredSourcesAria")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("ingest.registeredSources")}</span>
            <h2>{formatCount(sources.length, "source")}</h2>
          </div>
        </div>
        {processNotice && <p className="result-notice" role="status" aria-live="polite">{processNotice}</p>}
        {processError && <p className="result-notice error" role="alert">{processError}</p>}
        {processWarnings.length > 0 && (
          <div className="warning-list">
            {processWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        {sources.length === 0 ? (
          <p className="empty-state">{t("ingest.noSources")}</p>
        ) : (
          <div className="detail-list">
            {sources.map((source) => (
              <article className="detail-row source-row" key={source.id} aria-label={t("ingest.sourceRowAria", { title: source.title })}>
                <div>
                  <strong>{source.title}</strong>
                  <div className="pill-row">
                    <span className="pill">{source.kind}</span>
                    <StatusBadge status={source.status} />
                    {source.kind === "audio" && (
                      <span className="pill">{source.transcript ? t("ingest.transcriptReady") : t("ingest.noTranscriptYet")}</span>
                    )}
                  </div>
                  <small className="muted">{t("ingest.addedByAt", { createdBy: source.createdBy, createdAt: source.createdAt })}</small>
                  {source.error && <p className="result-notice error">{source.error}</p>}
                  {source.warnings && source.warnings.length > 0 && (
                    <ul className="source-warnings" aria-label={t("ingest.processingWarningsAria", { title: source.title })}>
                      {source.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={processingSourceId !== null}
                  onClick={() => handleProcessSource(source.id)}
                >
                  {processingSourceId === source.id ? t("ingest.processing") : t("ingest.processSource", { title: source.title })}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card" aria-label={t("ingest.extractionDraftQueueAria")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("ingest.extractionDrafts")}</span>
            <h2>{formatCount(drafts.length, "proposed draft")}</h2>
          </div>
        </div>
        {draftNotice && <p className="result-notice" role="status" aria-live="polite">{draftNotice}</p>}
        {draftError && <p className="result-notice error" role="alert">{draftError}</p>}
        {bulkFailures.length > 0 && (
          <ul className="warning-list" aria-label={t("ingest.bulkReviewFailuresAria")}>
            {bulkFailures.map((failure) => (
              <li key={failure.draftId}>{failure.draftId}: {failure.error}</li>
            ))}
          </ul>
        )}
        {drafts.length === 0 ? (
          <p className="empty-state">{t("ingest.noDrafts")}</p>
        ) : (
          <>
            <div className="pill-row bulk-review-bar" aria-label={t("ingest.bulkDraftReviewAria")}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  aria-label={t("ingest.selectAllProposedAria")}
                  checked={drafts.length > 0 && selectedDraftIds.length === drafts.length}
                  disabled={isBulkReviewing}
                  onChange={toggleSelectAllProposed}
                />
                <span>{t("ingest.selectAllProposed")}</span>
              </label>
              <span className="muted">{t("ingest.selectedCount", { count: selectedDraftIds.length })}</span>
              <button
                type="button"
                className="secondary"
                disabled={isBulkReviewing || selectedDraftIds.length === 0}
                onClick={() => { void handleBulkReview("accept"); }}
              >
                {isBulkReviewing
                  ? t("ingest.reviewingSelected")
                  : pendingBulkAction === "accept"
                    ? t("ingest.confirmAcceptSelected")
                    : t("ingest.acceptSelected")}
              </button>
              <button
                type="button"
                className="contest"
                disabled={isBulkReviewing || selectedDraftIds.length === 0}
                onClick={() => { void handleBulkReview("reject"); }}
              >
                {isBulkReviewing
                  ? t("ingest.reviewingSelected")
                  : pendingBulkAction === "reject"
                    ? t("ingest.confirmRejectSelected")
                    : t("ingest.rejectSelected")}
              </button>
            </div>
            <div className="detail-list">
            {drafts.map((draft) => (
              <article className="detail-row draft-row" key={draft.id} aria-label={t("ingest.extractionDraftRowAria", { id: draft.id })}>
                <div>
                  <div className="pill-row">
                    <input
                      type="checkbox"
                      aria-label={t("ingest.selectDraftAria", { id: draft.id })}
                      checked={selectedDraftIds.includes(draft.id)}
                      disabled={isBulkReviewing}
                      onChange={() => toggleDraftSelection(draft.id)}
                    />
                    <span className="pill">{t(`draftKind.${draft.kind}`)}</span>
                    <ConfidenceBadge confidence={draft.confidence} />
                    {draft.duplicate && (
                      <span className={`status-badge ${draft.duplicate.kind === "pending" ? "under_review" : "contested"}`}>
                        {t(`draftDuplicate.${draft.duplicate.kind}`)}
                      </span>
                    )}
                    {draft.grounding?.map((flag) => (
                      <span
                        key={`${flag.kind}:${flag.message}`}
                        className="status-badge contested"
                        title={flag.message}
                      >
                        {t(`draftGrounding.${flag.kind}`)}
                      </span>
                    ))}
                  </div>
                  <strong>{extractionDraftSummary(draft)}</strong>
                  {draft.rationale && <p>{draft.rationale}</p>}
                </div>
                <div className="correction-actions draft-actions">
                  <button
                    type="button"
                    className="secondary"
                    aria-label={t("ingest.acceptDraftAria", { id: draft.id })}
                    disabled={reviewingDraftId !== null}
                    onClick={() => handleDraftDecision(draft.id, "accept")}
                  >
                    {reviewingDraftId === draft.id ? t("ingest.reviewing") : t("ingest.accept")}
                  </button>
                  <button
                    type="button"
                    className="contest"
                    aria-label={t("ingest.rejectDraftAria", { id: draft.id })}
                    disabled={reviewingDraftId !== null}
                    onClick={() => handleDraftDecision(draft.id, "reject")}
                  >
                    {t("ingest.reject")}
                  </button>
                </div>
              </article>
            ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
