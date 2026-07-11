import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Note } from "@assini/api-contract";
import type { DashboardData } from "../api";
import { generateDraftNotes, generateModelDraftNotes, reviewNote, runEvaluation } from "../api";
import type { PublicNote, ReviewStatus, ViewMode } from "../lib/types";
import { localizeApiError } from "../lib/format";
import {
  REVIEWER_COMMENT_KEYS,
  REVIEWER_EDITED_EXAMPLES_COMMENT_KEY,
  REVIEWER_EDITED_EXPLANATION_AND_EXAMPLES_COMMENT_KEY,
  REVIEWER_EDITED_EXPLANATION_COMMENT_KEY
} from "../lib/viewConfig";
import { useI18n } from "../i18n";

export type NoteReviewEdits = {
  explanation: string;
  examples: Note["examples"];
};

export interface ReviewWorkspace {
  selectedNote: PublicNote | null;
  selectedNoteId: string | null;
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>;
  isEvaluating: boolean;
  isDrafting: boolean;
  isModelDrafting: boolean;
  modelDraftMessage: string | null;
  modelDraftError: string | null;
  workspaceActionError: string | null;
  setWorkspaceActionError: Dispatch<SetStateAction<string | null>>;
  reviewingNoteId: string | null;
  reviewActionError: string | null;
  setReviewActionError: Dispatch<SetStateAction<string | null>>;
  handleRunEval: () => Promise<void>;
  handleGenerateDrafts: () => Promise<void>;
  handleGenerateModelDrafts: () => Promise<void>;
  handleReview: (status: ReviewStatus) => Promise<void>;
  handleSaveNoteExplanation: (edits: NoteReviewEdits) => Promise<void>;
}

/**
 * Owns review/eval/note workspace state: draft generation, evaluation runs,
 * note selection, and review/save handlers, plus the busy flags the shell
 * uses for workflow locking.
 */
export function useReviewWorkspace(
  view: ViewMode,
  selectedLanguageId: string | null,
  data: DashboardData | null,
  refreshDashboard: () => Promise<void>
): ReviewWorkspace {
  const { t } = useI18n();
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isModelDrafting, setIsModelDrafting] = useState(false);
  const [modelDraftMessage, setModelDraftMessage] = useState<string | null>(null);
  const [modelDraftError, setModelDraftError] = useState<string | null>(null);
  const [workspaceActionError, setWorkspaceActionError] = useState<string | null>(null);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const selectedNote = data?.notes.find((note) => note.id === selectedNoteId) ?? data?.notes[0] ?? null;

  useEffect(() => {
    setWorkspaceActionError(null);
  }, [view, selectedLanguageId]);

  async function handleRunEval() {
    if (isEvaluating) return;
    setIsEvaluating(true);
    setWorkspaceActionError(null);
    try {
      await runEvaluation();
      await refreshDashboard();
    } catch (error) {
      setWorkspaceActionError(localizeApiError(error, t, "errors.evaluationRunFailed"));
    } finally {
      setIsEvaluating(false);
    }
  }

  async function handleGenerateDrafts() {
    if (!selectedLanguageId) return;
    setIsDrafting(true);
    setWorkspaceActionError(null);
    try {
      await generateDraftNotes(selectedLanguageId);
      await refreshDashboard();
    } catch (error) {
      setWorkspaceActionError(localizeApiError(error, t, "errors.draftGenerationFailed"));
    } finally {
      setIsDrafting(false);
    }
  }

  async function handleGenerateModelDrafts() {
    if (!selectedLanguageId) return;
    setIsModelDrafting(true);
    setModelDraftMessage(null);
    setModelDraftError(null);
    setWorkspaceActionError(null);
    try {
      const { generated, warnings, notes } = await generateModelDraftNotes(selectedLanguageId);
      await refreshDashboard();
      const summary = t(generated === 1 ? "review.modelDraftSummaryOne" : "review.modelDraftSummaryOther", {
        count: generated
      });
      const scored = notes?.filter((note) => note.grounding) ?? [];
      const groundingSummary =
        scored.length > 0
          ? ` ${t("review.groundingLabel")} ${scored
              .map((note) => `${Math.round((note.grounding?.score ?? 0) * 100)}%`)
              .join(
                ", "
              )}.${scored.some((note) => (note.grounding?.failures.length ?? 0) > 0) ? ` ${t("review.reviewFlagged")}` : ""}`
          : "";
      setModelDraftMessage(
        warnings.length > 0 ? `${summary}${groundingSummary} ${warnings.join(" ")}` : `${summary}${groundingSummary}`
      );
    } catch (error) {
      setModelDraftError(localizeApiError(error, t, "errors.modelDraftGenerationFailed"));
    } finally {
      setIsModelDrafting(false);
    }
  }

  async function handleReview(status: ReviewStatus) {
    if (!selectedNote) return;
    setReviewingNoteId(selectedNote.id);
    setReviewActionError(null);
    try {
      await reviewNote(selectedNote.id, {
        status,
        reviewerComment: t(REVIEWER_COMMENT_KEYS[status])
      });
      await refreshDashboard();
    } catch (error) {
      // Keep the workspace mounted; surface the failure in ReviewView instead of
      // replacing the whole app with a fatal load-state screen.
      setReviewActionError(localizeApiError(error, t, "errors.noteReviewFailed"));
    } finally {
      setReviewingNoteId(null);
    }
  }

  async function handleSaveNoteExplanation(edits: NoteReviewEdits) {
    if (!selectedNote) return;
    setReviewingNoteId(selectedNote.id);
    setReviewActionError(null);
    const explanationChanged = edits.explanation !== selectedNote.explanation;
    const examplesChanged = JSON.stringify(edits.examples) !== JSON.stringify(selectedNote.examples);
    const reviewerComment =
      explanationChanged && examplesChanged
        ? t(REVIEWER_EDITED_EXPLANATION_AND_EXAMPLES_COMMENT_KEY)
        : examplesChanged
          ? t(REVIEWER_EDITED_EXAMPLES_COMMENT_KEY)
          : t(REVIEWER_EDITED_EXPLANATION_COMMENT_KEY);
    try {
      await reviewNote(selectedNote.id, {
        ...(explanationChanged ? { explanation: edits.explanation } : {}),
        ...(examplesChanged ? { examples: edits.examples } : {}),
        reviewerComment
      });
      await refreshDashboard();
    } catch (error) {
      setReviewActionError(localizeApiError(error, t, "errors.noteExplanationUpdateFailed"));
      throw error;
    } finally {
      setReviewingNoteId(null);
    }
  }

  return {
    selectedNote,
    selectedNoteId,
    setSelectedNoteId,
    isEvaluating,
    isDrafting,
    isModelDrafting,
    modelDraftMessage,
    modelDraftError,
    workspaceActionError,
    setWorkspaceActionError,
    reviewingNoteId,
    reviewActionError,
    setReviewActionError,
    handleRunEval,
    handleGenerateDrafts,
    handleGenerateModelDrafts,
    handleReview,
    handleSaveNoteExplanation
  };
}
