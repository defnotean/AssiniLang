import { useState } from "react";
import type { Morpheme } from "@assini/api-contract";
import type { AcceptExtractionDraftOptions, ExtractionDraftView } from "../api";
import { useI18n, type Translate } from "../i18n";

function cloneMorphemes(morphemes: Morpheme[]): Morpheme[] {
  return morphemes.map((morpheme) => ({
    ...morpheme,
    features: [...morpheme.features]
  }));
}

function formatMorphemeLine(morpheme: Pick<Morpheme, "surface" | "gloss">, t: Translate): string {
  return t("ingest.segmentationConflict.morphemeLine", {
    surface: morpheme.surface,
    gloss: morpheme.gloss
  });
}

export function hasSegmentationConflict(draft: ExtractionDraftView): boolean {
  return (
    draft.kind === "corpus_passage" && (draft.grounding?.some((flag) => flag.kind === "segmentation_conflict") ?? false)
  );
}

export function SegmentationConflictPanel({
  draft,
  disabled,
  busy,
  onAccept
}: {
  draft: ExtractionDraftView;
  disabled: boolean;
  busy: boolean;
  onAccept: (options?: AcceptExtractionDraftOptions) => void;
}) {
  const { t } = useI18n();
  const draftSegmentation = draft.payload.morphologicalSegmentation ?? [];
  const lexiconProposal = draft.lexiconSegmentationProposal ?? [];
  const [editing, setEditing] = useState(false);
  const [editedSegmentation, setEditedSegmentation] = useState<Morpheme[]>(() => cloneMorphemes(draftSegmentation));

  function startEdit() {
    setEditedSegmentation(cloneMorphemes(draftSegmentation));
    setEditing(true);
  }

  function updateGloss(index: number, gloss: string) {
    setEditedSegmentation((previous) =>
      previous.map((morpheme, itemIndex) => (itemIndex === index ? { ...morpheme, gloss } : morpheme))
    );
  }

  const editedReady = editedSegmentation.every(
    (morpheme) =>
      morpheme.surface.trim().length > 0 && morpheme.lemma.trim().length > 0 && morpheme.gloss.trim().length > 0
  );

  return (
    <details className="segmentation-conflict-panel">
      <summary>{t("ingest.segmentationConflict.resolve")}</summary>
      <div className="segmentation-conflict-body">
        <div className="segmentation-conflict-compare">
          <div>
            <span className="detail-label">{t("ingest.segmentationConflict.draftLabel")}</span>
            <ul className="segmentation-conflict-list">
              {draftSegmentation.map((morpheme, index) => (
                <li key={`draft-${index}-${morpheme.surface}`}>{formatMorphemeLine(morpheme, t)}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="detail-label">{t("ingest.segmentationConflict.lexiconLabel")}</span>
            {lexiconProposal.length > 0 ? (
              <ul className="segmentation-conflict-list">
                {lexiconProposal.map((morpheme, index) => (
                  <li key={`lex-${index}-${morpheme.surface}`}>{formatMorphemeLine(morpheme, t)}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("ingest.segmentationConflict.noLexiconProposal")}</p>
            )}
          </div>
        </div>

        {editing && (
          <div
            className="segmentation-conflict-edit"
            role="group"
            aria-label={t("ingest.segmentationConflict.editGroupAria")}
          >
            {editedSegmentation.map((morpheme, index) => (
              <label key={`edit-${index}-${morpheme.surface}`} className="segmentation-conflict-edit-row">
                <span>{morpheme.surface}</span>
                <input
                  type="text"
                  value={morpheme.gloss}
                  disabled={disabled || busy}
                  aria-label={t("ingest.segmentationConflict.glossAria", { surface: morpheme.surface })}
                  onChange={(event) => updateGloss(index, event.target.value)}
                />
              </label>
            ))}
          </div>
        )}

        <div className="segmentation-conflict-actions">
          <button
            type="button"
            className="secondary"
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            onClick={() => onAccept()}
          >
            {busy ? t("ingest.reviewing") : t("ingest.segmentationConflict.keepDraft")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || busy || lexiconProposal.length === 0}
            aria-busy={busy || undefined}
            onClick={() => onAccept({ preferLexiconSegmentation: true })}
          >
            {t("ingest.segmentationConflict.preferLexicon")}
          </button>
          {!editing ? (
            <button
              type="button"
              className="secondary"
              disabled={disabled || busy || draftSegmentation.length === 0}
              onClick={startEdit}
            >
              {t("ingest.segmentationConflict.edit")}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="secondary"
                disabled={disabled || busy || !editedReady}
                aria-busy={busy || undefined}
                onClick={() =>
                  onAccept({
                    morphologicalSegmentation: editedSegmentation.map((morpheme) => ({
                      ...morpheme,
                      surface: morpheme.surface.trim(),
                      lemma: morpheme.lemma.trim(),
                      gloss: morpheme.gloss.trim()
                    }))
                  })
                }
              >
                {t("ingest.segmentationConflict.acceptEdited")}
              </button>
              <button type="button" className="secondary" disabled={disabled || busy} onClick={() => setEditing(false)}>
                {t("ingest.segmentationConflict.cancelEdit")}
              </button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
