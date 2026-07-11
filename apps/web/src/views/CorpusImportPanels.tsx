import type { Dispatch, FormEventHandler, RefObject, SetStateAction } from "react";
import { CORPUS_CONSENT_USE_VALUES, type CorpusImportDraft } from "../corpusImport";
import type { Translate } from "../i18n";

type CorpusImportPanelsProps = {
  bulkError: string | null;
  bulkFormRef: RefObject<HTMLDivElement | null>;
  bulkMessage: string | null;
  bulkPaste: string;
  canImportBulk: boolean;
  canImportPassage: boolean;
  canValidateBulk: boolean;
  canValidatePassage: boolean;
  handleImportBulk: () => Promise<void>;
  handleImportCorpus: FormEventHandler<HTMLFormElement>;
  handleValidateBulk: () => Promise<void>;
  handleValidateCorpus: () => Promise<void>;
  importDraft: CorpusImportDraft;
  importError: string | null;
  importFormRef: RefObject<HTMLFormElement | null>;
  importMessage: string | null;
  isBulkOpen: boolean;
  isImportOpen: boolean;
  isImportingBulk: boolean;
  isImportingCorpus: boolean;
  isValidatingBulk: boolean;
  isValidatingCorpus: boolean;
  setIsBulkOpen: Dispatch<SetStateAction<boolean>>;
  setIsImportOpen: Dispatch<SetStateAction<boolean>>;
  t: Translate;
  updateBulkPaste: (value: string) => void;
  updateImportDraft: (field: keyof CorpusImportDraft, value: string) => void;
};

export function CorpusImportPanels({
  bulkError,
  bulkFormRef,
  bulkMessage,
  bulkPaste,
  canImportBulk,
  canImportPassage,
  canValidateBulk,
  canValidatePassage,
  handleImportBulk,
  handleImportCorpus,
  handleValidateBulk,
  handleValidateCorpus,
  importDraft,
  importError,
  importFormRef,
  importMessage,
  isBulkOpen,
  isImportOpen,
  isImportingBulk,
  isImportingCorpus,
  isValidatingBulk,
  isValidatingCorpus,
  setIsBulkOpen,
  setIsImportOpen,
  t,
  updateBulkPaste,
  updateImportDraft
}: CorpusImportPanelsProps) {
  return (
    <>
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
            <button type="submit" className="secondary" disabled={!canImportPassage} aria-busy={isImportingCorpus}>
              {isImportingCorpus ? t("corpus.importing") : t("corpus.importPassage")}
            </button>
          </div>
        )}
        {isImportOpen && (
          <p id="corpus-validate-dry-run-hint" className="inline-empty muted">
            {t("corpus.validateDryRunHint")}
          </p>
        )}
        {importMessage && (
          <p className="result-notice" role="status" aria-live="polite">
            {importMessage}
          </p>
        )}
        {importError && (
          <p className="result-notice error" role="alert">
            {importError}
          </p>
        )}
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
        {bulkMessage && (
          <p className="result-notice" role="status" aria-live="polite">
            {bulkMessage}
          </p>
        )}
        {bulkError && (
          <p className="result-notice error" role="alert">
            {bulkError}
          </p>
        )}
      </div>
    </>
  );
}
