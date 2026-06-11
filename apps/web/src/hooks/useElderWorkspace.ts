import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { ElderCorrection } from "@assini/db";
import type { ElderContext, ElderCorrectionPayload, ElderCorrectionReviewStatus } from "../api";
import { applyElderCorrection, fetchElderContext, reviewElderCorrection, submitElderCorrection } from "../api";

export interface ElderWorkspaceState {
  elderContext: ElderContext | null;
  isLoadingElder: boolean;
  correctionSuccess: string | null;
  correctionError: string | null;
  formNoteId: string;
  setFormNoteId: Dispatch<SetStateAction<string>>;
  formPassageId: string;
  setFormPassageId: Dispatch<SetStateAction<string>>;
  formSeverity: ElderCorrection["severity"];
  setFormSeverity: Dispatch<SetStateAction<ElderCorrection["severity"]>>;
  formCorrection: string;
  setFormCorrection: Dispatch<SetStateAction<string>>;
  formRationale: string;
  setFormRationale: Dispatch<SetStateAction<string>>;
  formContextText: string;
  setFormContextText: Dispatch<SetStateAction<string>>;
  isSubmittingCorrection: boolean;
  reviewingCorrectionId: string | null;
  applyingCorrectionId: string | null;
  correctionApplyDrafts: Record<string, string>;
  setCorrectionApplyDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  handleSubmitCorrection: (event: FormEvent) => Promise<void>;
  handleReviewCorrection: (correctionId: string, status: ElderCorrectionReviewStatus) => Promise<void>;
  handleApplyCorrection: (correctionId: string, explanation: string) => Promise<void>;
}

/**
 * Owns the elder workspace state: elder context loading, the correction form
 * fields, and the submit/review/apply correction handlers, plus the
 * per-language/per-mode reset effects.
 */
export function useElderWorkspace(
  selectedLanguageId: string | null,
  isElderMode: boolean,
  refreshDashboard: () => Promise<void>,
  refreshModelObservability: () => Promise<void>
): ElderWorkspaceState {
  const [elderContext, setElderContext] = useState<ElderContext | null>(null);
  const [isLoadingElder, setIsLoadingElder] = useState(false);
  const [correctionSuccess, setCorrectionSuccess] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [formNoteId, setFormNoteId] = useState("");
  const [formPassageId, setFormPassageId] = useState("");
  const [formSeverity, setFormSeverity] = useState<ElderCorrection["severity"]>("minor");
  const [formCorrection, setFormCorrection] = useState("");
  const [formRationale, setFormRationale] = useState("");
  const [formContextText, setFormContextText] = useState("");
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [reviewingCorrectionId, setReviewingCorrectionId] = useState<string | null>(null);
  const [applyingCorrectionId, setApplyingCorrectionId] = useState<string | null>(null);
  const [correctionApplyDrafts, setCorrectionApplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let isCurrent = true;
    if (!isElderMode || !selectedLanguageId) {
      setElderContext(null);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoadingElder(true);
    setCorrectionSuccess(null);
    setCorrectionError(null);

    fetchElderContext(selectedLanguageId)
      .then((context) => {
        if (isCurrent) setElderContext(context);
      })
      .catch(() => {
        if (isCurrent) setElderContext(null);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingElder(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedLanguageId, isElderMode]);

  useEffect(() => {
    setFormNoteId("");
    setFormPassageId("");
    setFormSeverity("minor");
    setFormCorrection("");
    setFormRationale("");
    setFormContextText("");
    setCorrectionApplyDrafts({});
    setCorrectionSuccess(null);
    setCorrectionError(null);
  }, [selectedLanguageId, isElderMode]);

  async function handleSubmitCorrection(event: FormEvent) {
    event.preventDefault();
    if (!formCorrection.trim() || !formRationale.trim()) {
      setCorrectionError("Please describe both the correction and the rationale.");
      return;
    }

    if (!formNoteId && !formPassageId && !formContextText.trim()) {
      setCorrectionError("Linguistic Rule: You must bind the correction to at least one context indicator (choose a Note, choose a Passage, or provide a Custom Context snippet).");
      return;
    }

    if (!selectedLanguageId) {
      setCorrectionError("Select or create a language first.");
      return;
    }

    setIsSubmittingCorrection(true);
    setCorrectionSuccess(null);
    setCorrectionError(null);

    const payload: ElderCorrectionPayload = {
      languageId: selectedLanguageId,
      noteId: formNoteId || undefined,
      passageId: formPassageId || undefined,
      correction: formCorrection.trim(),
      rationale: formRationale.trim(),
      severity: formSeverity,
      contextText: formContextText.trim() || undefined
    };

    try {
      await submitElderCorrection(payload);
      setCorrectionSuccess("Elder Correction submitted successfully!");
      setFormCorrection("");
      setFormRationale("");
      setFormContextText("");
      setFormNoteId("");
      setFormPassageId("");
      setElderContext(await fetchElderContext(selectedLanguageId));
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Elder correction submission failed";
      setCorrectionError(message);
    } finally {
      setIsSubmittingCorrection(false);
    }
  }

  async function handleReviewCorrection(correctionId: string, status: ElderCorrectionReviewStatus) {
    if (!selectedLanguageId) return;
    setReviewingCorrectionId(correctionId);
    setCorrectionSuccess(null);
    setCorrectionError(null);
    try {
      await reviewElderCorrection(correctionId, status);
      setCorrectionSuccess(status === "accepted" ? "Elder correction accepted." : "Elder correction rejected.");
      setElderContext(await fetchElderContext(selectedLanguageId));
      await refreshModelObservability();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Elder correction review failed";
      setCorrectionError(message);
    } finally {
      setReviewingCorrectionId(null);
    }
  }

  async function handleApplyCorrection(correctionId: string, explanation: string) {
    const revisedExplanation = explanation.trim();
    if (!revisedExplanation) {
      setCorrectionSuccess(null);
      setCorrectionError("Please provide a revised explanation before applying the correction.");
      return;
    }

    if (!selectedLanguageId) {
      setCorrectionSuccess(null);
      setCorrectionError("Select or create a language first.");
      return;
    }

    setApplyingCorrectionId(correctionId);
    setCorrectionSuccess(null);
    setCorrectionError(null);
    try {
      await applyElderCorrection(correctionId, revisedExplanation);
      setCorrectionSuccess("Elder correction applied to linked note.");
      setCorrectionApplyDrafts((current) => {
        const next = { ...current };
        delete next[correctionId];
        return next;
      });
      setElderContext(await fetchElderContext(selectedLanguageId));
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Elder correction apply failed";
      setCorrectionError(message);
    } finally {
      setApplyingCorrectionId(null);
    }
  }

  return {
    elderContext,
    isLoadingElder,
    correctionSuccess,
    correctionError,
    formNoteId,
    setFormNoteId,
    formPassageId,
    setFormPassageId,
    formSeverity,
    setFormSeverity,
    formCorrection,
    setFormCorrection,
    formRationale,
    setFormRationale,
    formContextText,
    setFormContextText,
    isSubmittingCorrection,
    reviewingCorrectionId,
    applyingCorrectionId,
    correctionApplyDrafts,
    setCorrectionApplyDrafts,
    handleSubmitCorrection,
    handleReviewCorrection,
    handleApplyCorrection
  };
}
