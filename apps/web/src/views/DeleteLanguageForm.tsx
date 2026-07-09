import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Language } from "../lib/types";
import { useI18n } from "../i18n";

export function DeleteLanguageForm({
  languages,
  selectedLanguageId,
  isWorkflowBusy,
  onDelete
}: {
  languages: Language[];
  selectedLanguageId: string | null;
  isWorkflowBusy: boolean;
  onDelete: (languageId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [languageId, setLanguageId] = useState(selectedLanguageId ?? "");
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectedLanguage = useMemo(
    () => languages.find((language) => language.id === languageId) ?? null,
    [languageId, languages]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (selectedLanguageId && languages.some((language) => language.id === selectedLanguageId)) {
      setLanguageId(selectedLanguageId);
    } else {
      setLanguageId(languages[0]?.id ?? "");
    }
    setConfirmName("");
    setDeleteError(null);
  }, [isOpen, languages, selectedLanguageId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedLanguage) {
      setDeleteError(t("deleteLang.noLanguageSelected"));
      return;
    }
    if (confirmName.trim() !== selectedLanguage.name) {
      setDeleteError(t("deleteLang.confirmNameMismatch"));
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(selectedLanguage.id);
      setIsOpen(false);
      setConfirmName("");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("deleteLang.deletionFailed");
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  if (languages.length === 0) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        className="secondary delete-language-toggle contest"
        disabled={isWorkflowBusy}
        onClick={() => setIsOpen(true)}
      >
        {t("deleteLang.deleteLanguage")}
      </button>
    );
  }

  return (
    <form
      className="form-panel compact delete-language-form"
      aria-label={t("deleteLang.deleteLanguage")}
      onSubmit={handleSubmit}
    >
      <div>
        <span className="detail-label">{t("deleteLang.workspaceCleanup")}</span>
        <h3>{t("deleteLang.deleteLanguage")}</h3>
        <p className="detail-label">{t("deleteLang.permanentWarning")}</p>
      </div>
      {deleteError && (
        <p className="result-notice error" role="alert">
          {deleteError}
        </p>
      )}
      <div className="form-group">
        <label htmlFor="delete-language-select">{t("deleteLang.languageLabel")}</label>
        <select
          id="delete-language-select"
          value={languageId}
          onChange={(event) => {
            setLanguageId(event.target.value);
            setConfirmName("");
            setDeleteError(null);
          }}
        >
          {languages.map((language) => (
            <option key={language.id} value={language.id}>
              {language.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="delete-language-confirm">{t("deleteLang.confirmNameLabel")}</label>
        <input
          id="delete-language-confirm"
          value={confirmName}
          placeholder={selectedLanguage?.name ?? ""}
          onChange={(event) => setConfirmName(event.target.value)}
        />
      </div>
      <button
        type="submit"
        className="reject"
        disabled={isWorkflowBusy || isDeleting || !selectedLanguage || confirmName.trim() !== selectedLanguage.name}
        aria-busy={isDeleting}
      >
        {isDeleting ? t("deleteLang.deleting") : t("deleteLang.confirmDelete")}
      </button>
      <button type="button" className="secondary" disabled={isDeleting} onClick={() => setIsOpen(false)}>
        {t("common.cancel")}
      </button>
    </form>
  );
}
