import { useCallback, useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { ElderCorrection } from "@assini/db";
import type { ElderContext, ElderCorrectionPayload, ElderCorrectionReviewStatus } from "../api";
import { applyElderCorrection, fetchElderContext, reviewElderCorrection, submitElderCorrection } from "../api";
import { useI18n } from "../i18n";
import { localizeApiError } from "../lib/format";

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
  reloadElderContext: () => void;
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
  const { t } = useI18n();
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
  const scopeRef = useRef({ selectedLanguageId, isElderMode });
  const contextRequestRef = useRef(0);
  const submitRequestRef = useRef(0);
  const reviewRequestRef = useRef(0);
  const applyRequestRef = useRef(0);

  if (
    scopeRef.current.selectedLanguageId !== selectedLanguageId ||
    scopeRef.current.isElderMode !== isElderMode
  ) {
    scopeRef.current = { selectedLanguageId, isElderMode };
  }

  function isCurrentScope(languageId: string): boolean {
    return scopeRef.current.isElderMode && scopeRef.current.selectedLanguageId === languageId;
  }

  const reloadElderContext = useCallback(() => {
    if (!isElderMode || !selectedLanguageId) return;

    const requestId = ++contextRequestRef.current;
    const languageId = selectedLanguageId;
    setIsLoadingElder(true);
    setCorrectionError(null);
    fetchElderContext(languageId)
      .then((context) => {
        if (requestId === contextRequestRef.current && isCurrentScope(languageId)) setElderContext(context);
      })
      .catch((error: unknown) => {
        if (requestId !== contextRequestRef.current || !isCurrentScope(languageId)) return;
        setElderContext(null);
        setCorrectionError(localizeApiError(error, t, "elderWs.errContextLoadFailed"));
      })
      .finally(() => {
        if (requestId === contextRequestRef.current && isCurrentScope(languageId)) setIsLoadingElder(false);
      });
  }, [isElderMode, selectedLanguageId, t]);

  useEffect(() => {
    const requestId = ++contextRequestRef.current;
    if (!isElderMode || !selectedLanguageId) {
      setElderContext(null);
      setIsLoadingElder(false);
      return () => {
        contextRequestRef.current += 1;
      };
    }

    setIsLoadingElder(true);
    setCorrectionSuccess(null);
    setCorrectionError(null);

    const languageId = selectedLanguageId;
    fetchElderContext(languageId)
      .then((context) => {
        if (requestId === contextRequestRef.current && isCurrentScope(languageId)) setElderContext(context);
      })
      .catch((error: unknown) => {
        if (requestId !== contextRequestRef.current || !isCurrentScope(languageId)) return;
        setElderContext(null);
        setCorrectionError(localizeApiError(error, t, "elderWs.errContextLoadFailed"));
      })
      .finally(() => {
        if (requestId === contextRequestRef.current && isCurrentScope(languageId)) setIsLoadingElder(false);
      });

    return () => {
      contextRequestRef.current += 1;
    };
  }, [selectedLanguageId, isElderMode, t]);

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
    setIsSubmittingCorrection(false);
    setReviewingCorrectionId(null);
    setApplyingCorrectionId(null);
    submitRequestRef.current += 1;
    reviewRequestRef.current += 1;
    applyRequestRef.current += 1;
  }, [selectedLanguageId, isElderMode]);

  async function handleSubmitCorrection(event: FormEvent) {
    event.preventDefault();
    if (!formCorrection.trim() || !formRationale.trim()) {
      setCorrectionError(t("elderWs.errMissingCorrectionOrRationale"));
      return;
    }

    if (!formNoteId && !formPassageId && !formContextText.trim()) {
      setCorrectionError(t("elderWs.errMissingContextBinding"));
      return;
    }

    if (!selectedLanguageId) {
      setCorrectionError(t("errors.selectOrCreateLanguage"));
      return;
    }

    setIsSubmittingCorrection(true);
    setCorrectionSuccess(null);
    setCorrectionError(null);

    const languageId = selectedLanguageId;
    const requestId = ++submitRequestRef.current;
    const payload: ElderCorrectionPayload = {
      languageId,
      noteId: formNoteId || undefined,
      passageId: formPassageId || undefined,
      correction: formCorrection.trim(),
      rationale: formRationale.trim(),
      severity: formSeverity,
      contextText: formContextText.trim() || undefined
    };

    try {
      await submitElderCorrection(payload);
      if (requestId !== submitRequestRef.current || !isCurrentScope(languageId)) return;
      setCorrectionSuccess(t("elderWs.msgSubmitSuccess"));
      setFormCorrection("");
      setFormRationale("");
      setFormContextText("");
      setFormNoteId("");
      setFormPassageId("");
      const context = await fetchElderContext(languageId);
      if (requestId !== submitRequestRef.current || !isCurrentScope(languageId)) return;
      setElderContext(context);
      await refreshDashboard();
    } catch (error) {
      if (requestId !== submitRequestRef.current || !isCurrentScope(languageId)) return;
      setCorrectionError(localizeApiError(error, t, "elderWs.errSubmitFailed"));
    } finally {
      if (requestId === submitRequestRef.current && isCurrentScope(languageId)) setIsSubmittingCorrection(false);
    }
  }

  async function handleReviewCorrection(correctionId: string, status: ElderCorrectionReviewStatus) {
    if (!selectedLanguageId) return;
    const languageId = selectedLanguageId;
    const requestId = ++reviewRequestRef.current;
    setReviewingCorrectionId(correctionId);
    setCorrectionSuccess(null);
    setCorrectionError(null);
    try {
      await reviewElderCorrection(correctionId, status);
      if (requestId !== reviewRequestRef.current || !isCurrentScope(languageId)) return;
      setCorrectionSuccess(status === "accepted" ? t("elderWs.msgReviewAccepted") : t("elderWs.msgReviewRejected"));
      const context = await fetchElderContext(languageId);
      if (requestId !== reviewRequestRef.current || !isCurrentScope(languageId)) return;
      setElderContext(context);
      await refreshModelObservability();
    } catch (error) {
      if (requestId !== reviewRequestRef.current || !isCurrentScope(languageId)) return;
      setCorrectionError(localizeApiError(error, t, "elderWs.errReviewFailed"));
    } finally {
      if (requestId === reviewRequestRef.current && isCurrentScope(languageId)) setReviewingCorrectionId(null);
    }
  }

  async function handleApplyCorrection(correctionId: string, explanation: string) {
    const revisedExplanation = explanation.trim();
    if (!revisedExplanation) {
      setCorrectionSuccess(null);
      setCorrectionError(t("elderWs.errMissingRevisedExplanation"));
      return;
    }

    if (!selectedLanguageId) {
      setCorrectionSuccess(null);
      setCorrectionError(t("errors.selectOrCreateLanguage"));
      return;
    }

    const languageId = selectedLanguageId;
    const requestId = ++applyRequestRef.current;
    setApplyingCorrectionId(correctionId);
    setCorrectionSuccess(null);
    setCorrectionError(null);
    try {
      await applyElderCorrection(correctionId, revisedExplanation);
      if (requestId !== applyRequestRef.current || !isCurrentScope(languageId)) return;
      setCorrectionSuccess(t("elderWs.msgApplySuccess"));
      setCorrectionApplyDrafts((current) => {
        const next = { ...current };
        delete next[correctionId];
        return next;
      });
      const context = await fetchElderContext(languageId);
      if (requestId !== applyRequestRef.current || !isCurrentScope(languageId)) return;
      setElderContext(context);
      await refreshDashboard();
    } catch (error) {
      if (requestId !== applyRequestRef.current || !isCurrentScope(languageId)) return;
      setCorrectionError(localizeApiError(error, t, "elderWs.errApplyFailed"));
    } finally {
      if (requestId === applyRequestRef.current && isCurrentScope(languageId)) setApplyingCorrectionId(null);
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
    handleApplyCorrection,
    reloadElderContext
  };
}
