import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Language, LanguagePhonology } from "@assini/db";
import { updateLanguage } from "../api";
import { localizeApiError } from "../lib/format";
import {
  buildPhonologyPatch,
  draftFromLanguage,
  hasDeclaredInventory,
  inventoriesEqual,
  validateInventorySymbol,
  type PhonologyInventoryDraft,
  type PhonologyInventoryKind
} from "../lib/phonologyInventory";
import { WORKSPACE_FOCUS } from "../lib/workspaceFocus";
import { useI18n } from "../i18n";

function InventoryChipList({
  kind,
  listLabel,
  symbols,
  disabled,
  onRemove
}: {
  kind: PhonologyInventoryKind;
  listLabel: string;
  symbols: string[];
  disabled: boolean;
  onRemove: (symbol: string) => void;
}) {
  const { t } = useI18n();

  if (symbols.length === 0) {
    return (
      <p className="muted phonology-inventory-empty" role="status">
        {t("profile.noneRecorded")}
      </p>
    );
  }

  return (
    <ul className="phonology-inventory-chips" aria-label={listLabel}>
      {symbols.map((symbol) => (
        <li key={`${kind}:${symbol}`}>
          <span className="pill phonology-inventory-chip">
            <code>{symbol}</code>
            <button
              type="button"
              className="phonology-inventory-remove"
              disabled={disabled}
              aria-label={t("profile.removeInventorySymbol", { symbol })}
              onClick={() => onRemove(symbol)}
            >
              ×
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PhonologyInventoryEditor({
  language,
  isWorkflowBusy,
  onSaved
}: {
  language: Language;
  isWorkflowBusy: boolean;
  onSaved: (updated: Language) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const baseId = useId();
  const consonantInputId = WORKSPACE_FOCUS.phonologyEditor;
  const vowelInputId = `${baseId}-vowel`;

  const [draft, setDraft] = useState<PhonologyInventoryDraft>(() => draftFromLanguage(language));
  const [consonantInput, setConsonantInput] = useState("");
  const [vowelInput, setVowelInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(draftFromLanguage(language));
    setConsonantInput("");
    setVowelInput("");
    setValidationError(null);
    setSaveError(null);
    setSaveNotice(null);
  }, [language]);

  const baseline = draftFromLanguage(language);
  const isDirty = !inventoriesEqual(draft, baseline);
  const controlsDisabled = isWorkflowBusy || isSaving;

  function validationMessage(reason: "blank" | "duplicate" | "whitespace"): string {
    if (reason === "blank") return t("profile.inventorySymbolBlank");
    if (reason === "duplicate") return t("profile.inventorySymbolDuplicate");
    return t("profile.inventorySymbolWhitespace");
  }

  function addSymbol(kind: PhonologyInventoryKind) {
    const raw = kind === "consonants" ? consonantInput : vowelInput;
    const existing = kind === "consonants" ? draft.consonants : draft.vowels;
    const result = validateInventorySymbol(raw, existing);
    if (!result.ok) {
      setValidationError(validationMessage(result.reason));
      setSaveNotice(null);
      return;
    }

    setDraft((current) => ({
      ...current,
      [kind]: [...current[kind], result.symbol]
    }));
    if (kind === "consonants") setConsonantInput("");
    else setVowelInput("");
    setValidationError(null);
    setSaveNotice(null);
  }

  function removeSymbol(kind: PhonologyInventoryKind, symbol: string) {
    setDraft((current) => ({
      ...current,
      [kind]: current[kind].filter((entry) => entry !== symbol)
    }));
    setValidationError(null);
    setSaveNotice(null);
  }

  function handleAddKeyDown(kind: PhonologyInventoryKind, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addSymbol(kind);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!isDirty || controlsDisabled) return;

    setIsSaving(true);
    setSaveError(null);
    setValidationError(null);
    setSaveNotice(null);

    try {
      const phonology: LanguagePhonology = buildPhonologyPatch(language, draft);
      const updated = await updateLanguage(language.id, { phonology });
      await onSaved(updated);
      setDraft(draftFromLanguage(updated));
      setSaveNotice(t("profile.inventorySaved"));
    } catch (error) {
      setSaveError(localizeApiError(error, t, "profile.inventorySaveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  const empty = !hasDeclaredInventory(draft);

  return (
    <section className="simple-section surface-section phonology-inventory-section" aria-label={t("profile.phonologyAriaLabel")}>
      <div className="simple-section-heading">
        <span className="detail-label">{t("profile.phonologyProfile")}</span>
        <h2>{empty ? t("profile.noPhonologyDeclared") : t("profile.inventoryEditorTitle")}</h2>
        <p>{empty ? t("profile.phonologyEmptyState") : t("profile.inventoryEditorBody")}</p>
      </div>

      <form className="form-panel compact phonology-inventory-form" aria-label={t("profile.inventoryEditorAria")} onSubmit={handleSave}>
        {(validationError || saveError) && (
          <p className="result-notice error" role="alert">
            {validationError ?? saveError}
          </p>
        )}
        {saveNotice && !validationError && !saveError && (
          <p className="result-notice" role="status" aria-live="polite">
            {saveNotice}
          </p>
        )}

        <div className="phonology-inventory-columns">
          <div className="form-group">
            <span className="detail-label">{t("profile.consonants")}</span>
            <InventoryChipList
              kind="consonants"
              listLabel={t("profile.consonantListAria")}
              symbols={draft.consonants}
              disabled={controlsDisabled}
              onRemove={(symbol) => removeSymbol("consonants", symbol)}
            />
            <div className="phonology-inventory-add-row">
              <label className="visually-hidden" htmlFor={consonantInputId}>{t("profile.consonantInputLabel")}</label>
              <input
                id={consonantInputId}
                value={consonantInput}
                disabled={controlsDisabled}
                placeholder={t("profile.inventorySymbolPlaceholder")}
                autoComplete="off"
                onChange={(event) => {
                  setConsonantInput(event.target.value);
                  setValidationError(null);
                }}
                onKeyDown={(event) => handleAddKeyDown("consonants", event)}
              />
              <button type="button" className="secondary" disabled={controlsDisabled} onClick={() => addSymbol("consonants")}>
                {t("profile.addConsonant")}
              </button>
            </div>
          </div>

          <div className="form-group">
            <span className="detail-label">{t("profile.vowels")}</span>
            <InventoryChipList
              kind="vowels"
              listLabel={t("profile.vowelListAria")}
              symbols={draft.vowels}
              disabled={controlsDisabled}
              onRemove={(symbol) => removeSymbol("vowels", symbol)}
            />
            <div className="phonology-inventory-add-row">
              <label className="visually-hidden" htmlFor={vowelInputId}>{t("profile.vowelInputLabel")}</label>
              <input
                id={vowelInputId}
                value={vowelInput}
                disabled={controlsDisabled}
                placeholder={t("profile.inventorySymbolPlaceholder")}
                autoComplete="off"
                onChange={(event) => {
                  setVowelInput(event.target.value);
                  setValidationError(null);
                }}
                onKeyDown={(event) => handleAddKeyDown("vowels", event)}
              />
              <button type="button" className="secondary" disabled={controlsDisabled} onClick={() => addSymbol("vowels")}>
                {t("profile.addVowel")}
              </button>
            </div>
          </div>
        </div>

        <div className="phonology-inventory-actions">
          <button type="submit" disabled={controlsDisabled || !isDirty} aria-busy={isSaving}>
            {isSaving ? t("profile.savingInventory") : t("common.save")}
          </button>
          {isDirty && (
            <button
              type="button"
              className="secondary"
              disabled={controlsDisabled}
              onClick={() => {
                setDraft(baseline);
                setConsonantInput("");
                setVowelInput("");
                setValidationError(null);
                setSaveError(null);
                setSaveNotice(null);
              }}
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
