import type { SourceAsset, SourceRegistrationPayload } from "../api";
import { ConfidenceBadge, StatusBadge } from "../components/badges";
import { useIngestExtraction } from "../hooks/useIngestExtraction";
import {
  extractionDraftSummary,
  formatCount,
  localizeSourceProcessingError,
  localizeSourceProcessingWarning,
  relativeAge,
  type RelativeAge
} from "../lib/format";
import { useI18n, type Translate } from "../i18n";

const PROCESSING_STALE_MS = 10 * 60 * 1000;

function isProcessingStale(source: SourceAsset, now = Date.now()): boolean {
  if (source.status !== "processing") return false;
  const marker = source.processingHeartbeatAt ?? source.processingStartedAt;
  if (!marker) return false;
  return now - Date.parse(marker) > PROCESSING_STALE_MS;
}

function processingHeartbeatMarker(source: SourceAsset): string | undefined {
  if (source.status !== "processing") return undefined;
  return source.processingHeartbeatAt ?? source.processingStartedAt;
}

function formatRelativeAgeLabel(age: RelativeAge, t: Translate): string {
  switch (age.kind) {
    case "justNow":
      return t("ingest.heartbeatAge.justNow");
    case "minutes":
      return t("ingest.heartbeatAge.minutes", { count: age.count });
    case "hours":
      return t("ingest.heartbeatAge.hours", { count: age.count });
    case "days":
      return t("ingest.heartbeatAge.days", { count: age.count });
  }
}

export function IngestView({
  languageId,
  onIntakeCommitted
}: {
  languageId: string;
  onIntakeCommitted?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const {
    sources,
    drafts,
    isLoadingIntake,
    intakeError,
    registerKind,
    setRegisterKind,
    registerTitle,
    setRegisterTitle,
    registerText,
    setRegisterText,
    registerUrl,
    setRegisterUrl,
    registerNotice,
    registerError,
    isRegisteringSource,
    uploadTitle,
    setUploadTitle,
    uploadFile,
    setUploadFile,
    isUploadingSource,
    vaultPath,
    setVaultPath,
    vaultIncludeSubfolders,
    setVaultIncludeSubfolders,
    vaultMaxFiles,
    setVaultMaxFiles,
    isImportingVault,
    vaultNotice,
    vaultError,
    processingSourceId,
    processNotice,
    processError,
    processWarnings,
    reviewingDraftId,
    draftNotice,
    draftError,
    selectedDraftIds,
    pendingBulkAction,
    isBulkReviewing,
    bulkFailures,
    handleRegisterSource,
    handleUploadSource,
    handleImportVault,
    handleProcessSource,
    handleDraftDecision,
    toggleDraftSelection,
    toggleSelectAllProposed,
    handleBulkReview
  } = useIngestExtraction(languageId, t, onIntakeCommitted);

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

      <form className="record-card form-panel compact" aria-label={t("ingest.obsidianVaultAria")} onSubmit={handleImportVault} aria-busy={isImportingVault}>
        <div>
          <span className="detail-label">{t("ingest.obsidianVault")}</span>
          <h3>{t("ingest.importVault")}</h3>
        </div>
        {vaultNotice && <p className="result-notice" role="status" aria-live="polite">{vaultNotice}</p>}
        {vaultError && <p className="result-notice error" role="alert">{vaultError}</p>}
        <div className="form-group">
          <label htmlFor="ingest-vault-path">{t("ingest.vaultPath")}</label>
          <input
            id="ingest-vault-path"
            value={vaultPath}
            required
            aria-required="true"
            onChange={(event) => setVaultPath(event.target.value)}
            placeholder={t("ingest.vaultPathPlaceholder")}
          />
        </div>
        <div className="settings-grid">
          <label className="checkbox-row settings-checkbox" htmlFor="ingest-vault-subfolders">
            <input
              id="ingest-vault-subfolders"
              type="checkbox"
              checked={vaultIncludeSubfolders}
              onChange={(event) => setVaultIncludeSubfolders(event.target.checked)}
            />
            {t("ingest.includeSubfolders")}
          </label>
          <div className="form-group">
            <label htmlFor="ingest-vault-max-files">{t("ingest.maxMarkdownFiles")}</label>
            <input
              id="ingest-vault-max-files"
              type="number"
              min="1"
              max="500"
              value={vaultMaxFiles}
              onChange={(event) => setVaultMaxFiles(event.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="secondary" disabled={isImportingVault} aria-busy={isImportingVault}>
          {isImportingVault ? t("ingest.importingVault") : t("ingest.importVaultSources")}
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
          <div className="warning-list" role="status" aria-live="polite">
            {processWarnings.map((warning, index) => (
              <p key={`${index}:${warning}`}>{localizeSourceProcessingWarning(warning, t)}</p>
            ))}
          </div>
        )}
        {sources.length === 0 ? (
          <div className="empty-state" role="status">
            <p>{t("ingest.noSources")}</p>
            <p className="muted">{t("ingest.noSourcesHint")}</p>
          </div>
        ) : (
          <div className="detail-list">
            {sources.map((source) => (
              <article className="detail-row source-row" key={source.id} aria-label={t("ingest.sourceRowAria", { title: source.title })}>
                <div>
                  <strong>{source.title}</strong>
                  <div className="pill-row">
                    <span className="pill">{source.kind}</span>
                    <StatusBadge status={source.status} />
                    {(source.status === "processing" || source.status === "failed") &&
                      source.processingAttempts !== undefined &&
                      source.processingAttempts > 0 && (
                      <span className="pill muted">{t("ingest.processingAttempts", { count: source.processingAttempts })}</span>
                    )}
                    {source.kind === "audio" && (
                      <span className="pill">{source.transcript ? t("ingest.transcriptReady") : t("ingest.noTranscriptYet")}</span>
                    )}
                    {(() => {
                      const marker = processingHeartbeatMarker(source);
                      if (!marker) return null;
                      return (
                        <span className="pill muted">
                          {t("ingest.processingHeartbeatAge", { age: formatRelativeAgeLabel(relativeAge(marker), t) })}
                        </span>
                      );
                    })()}
                  </div>
                  <small className="muted">{t("ingest.addedByAt", { createdBy: source.createdBy, createdAt: source.createdAt })}</small>
                  {isProcessingStale(source) && (() => {
                    const marker = processingHeartbeatMarker(source);
                    const age = marker ? formatRelativeAgeLabel(relativeAge(marker), t) : "";
                    return (
                      <p className="result-notice warning" role="status">
                        {t("ingest.processingStaleWarning", { age })}
                      </p>
                    );
                  })()}
                  {source.error && (
                    <p className="result-notice error">
                      {localizeSourceProcessingError(source.error, t, "ingest.sourceProcessingFailed")}
                    </p>
                  )}
                  {source.warnings && source.warnings.length > 0 && (
                    <ul className="source-warnings" aria-label={t("ingest.processingWarningsAria", { title: source.title })}>
                      {source.warnings.map((warning, index) => (
                        <li key={`${index}:${warning}`}>{localizeSourceProcessingWarning(warning, t)}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={processingSourceId !== null || source.status === "processing"}
                  onClick={() => handleProcessSource(source.id)}
                >
                  {processingSourceId === source.id || source.status === "processing"
                    ? source.kind === "document"
                      ? t("ingest.processingDocument")
                      : t("ingest.processing")
                    : t("ingest.processSource", { title: source.title })}
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
          <div className="empty-state" role="status">
            <p>{t("ingest.noDrafts")}</p>
            <p className="muted">{t("ingest.noDraftsHint")}</p>
          </div>
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
