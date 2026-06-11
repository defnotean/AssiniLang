import { useState, type FormEvent } from "react";
import type { LanguageCreatePayload } from "../api";
import { LANGUAGE_TYPOLOGY_OPTIONS } from "../lib/viewConfig";
import type { Language } from "../lib/types";

export function CreateLanguageForm({
  isWorkflowBusy,
  onCreate
}: {
  isWorkflowBusy: boolean;
  onCreate: (payload: LanguageCreatePayload) => Promise<void>;
}) {
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
      setCreateError("Name, description, and orthography are required.");
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
      const message = error instanceof Error ? error.message : "Language creation failed";
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className="secondary new-language-toggle" disabled={isWorkflowBusy} onClick={() => setIsOpen(true)}>
        New language
      </button>
    );
  }

  return (
    <form className="form-panel compact new-language-form" aria-label="Create language" onSubmit={handleSubmit}>
      <div>
        <span className="detail-label">Workspace setup</span>
        <h3>New language</h3>
      </div>
      {createError && <p className="result-notice error" role="alert">{createError}</p>}
      <div className="form-group">
        <label htmlFor="new-language-name">Language name</label>
        <input id="new-language-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-description">Description</label>
        <textarea
          id="new-language-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-orthography">Orthography</label>
        <input id="new-language-orthography" value={orthography} onChange={(event) => setOrthography(event.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-typology">Typology</label>
        <select
          id="new-language-typology"
          value={typology}
          onChange={(event) => setTypology(event.target.value as Language["typology"])}
        >
          {LANGUAGE_TYPOLOGY_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isWorkflowBusy || isCreating}>
        {isCreating ? "Creating..." : "Create language"}
      </button>
      <button type="button" className="secondary" disabled={isCreating} onClick={() => setIsOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
