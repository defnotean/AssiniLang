import { useState, type FormEvent } from "react";
import type { LanguageCreatePayload } from "../api";
import { formatTypology, localizeApiError } from "../lib/format";
import { LANGUAGE_TYPOLOGY_OPTIONS } from "../lib/viewConfig";
import { useI18n } from "../i18n";
import type { Language } from "../lib/types";

export function CreateLanguageForm({
  isWorkflowBusy,
  onCreate
}: {
  isWorkflowBusy: boolean;
  onCreate: (payload: LanguageCreatePayload) => Promise<void>;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [orthography, setOrthography] = useState("");
  const [typology, setTypology] = useState<Language["typology"]>("unknown");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !description.trim() || !orthography.trim()) {
      setCreateError(t("createLang.requiredFields"));
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        orthography: orthography.trim(),
        typology
      });
      setName("");
      setDescription("");
      setOrthography("");
      setTypology("unknown");
      setIsOpen(false);
    } catch (error) {
      setCreateError(localizeApiError(error, t, "createLang.creationFailed"));
    } finally {
      setIsCreating(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        className="secondary new-language-toggle"
        disabled={isWorkflowBusy}
        onClick={() => setIsOpen(true)}
      >
        {t("createLang.newLanguage")}
      </button>
    );
  }

  return (
    <form
      className="form-panel compact new-language-form"
      aria-label={t("createLang.createLanguage")}
      onSubmit={handleSubmit}
    >
      <div>
        <span className="detail-label">{t("createLang.workspaceSetup")}</span>
        <h3>{t("createLang.newLanguage")}</h3>
      </div>
      {createError && (
        <p className="result-notice error" role="alert">
          {createError}
        </p>
      )}
      <div className="form-group">
        <label htmlFor="new-language-name">{t("createLang.nameLabel")}</label>
        <input id="new-language-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-description">{t("createLang.descriptionLabel")}</label>
        <textarea
          id="new-language-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-orthography">{t("createLang.orthographyLabel")}</label>
        <input
          id="new-language-orthography"
          value={orthography}
          onChange={(event) => setOrthography(event.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-typology">{t("createLang.typologyLabel")}</label>
        <select
          id="new-language-typology"
          value={typology}
          onChange={(event) => setTypology(event.target.value as Language["typology"])}
        >
          {LANGUAGE_TYPOLOGY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {formatTypology(option, t)}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isWorkflowBusy || isCreating} aria-busy={isCreating}>
        {isCreating ? t("createLang.creating") : t("createLang.createLanguage")}
      </button>
      <button type="button" className="secondary" disabled={isCreating} onClick={() => setIsOpen(false)}>
        {t("common.cancel")}
      </button>
    </form>
  );
}
