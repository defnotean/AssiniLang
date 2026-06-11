import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AiSession, AuditEvent, ElderCorrection, GovernanceRecord, ReviewDisposition, ReviewPolicy, User } from "@assini/db";
import type {
  DashboardData,
  ElderContext,
  ElderCorrectionPayload,
  ExerciseAuthoringPayload,
  GeneratedExerciseDraft,
  CorpusImportPayload,
  GovernancePayload,
  LanguageCreatePayload,
  LanguageProfile,
  LlmReachability,
  LlmStatus,
  ObservabilityData,
  PublicExerciseSubmission,
  ElderCorrectionReviewStatus,
  ReviewPolicyPayload
} from "./api";
import {
  applyElderCorrection,
  checkLlmReachability,
  createAiSession,
  createExercise,
  createGovernanceRecord,
  createLanguage,
  fetchAuditEvents,
  fetchCurrentUser,
  fetchDashboardData,
  fetchElderContext,
  fetchEvaluationArtifact,
  fetchExerciseSubmissions,
  fetchGovernance,
  fetchLanguageProfile,
  fetchLanguageSnapshot,
  fetchLlmStatus,
  fetchObservability,
  fetchReviewDispositions,
  fetchReviewPolicy,
  generateDraftNotes,
  generateModelDraftNotes,
  generateModelExercise,
  importCorpusPassage,
  resolveReviewDisposition,
  reviewElderCorrection,
  reviewNote,
  runEvaluation,
  submitElderCorrection,
  submitExerciseAnswer,
  updateReviewPolicy
} from "./api";
import { StatusScreen } from "./components/StatusScreen";
import { CompassMark, DiamondBand, TypologyMark, ViewGlyph } from "./components/marks";
import {
  buildEvaluationArtifactDownload,
  buildSnapshotDownload,
  formatOrthographyMeta,
  isRealModelProvider,
  latestAssistantMessage,
  parseReviewerIds,
  sessionUsedDeterministicFallback
} from "./lib/format";
import { getInitialView, getStoredLanguageId, persistWorkspaceSelection } from "./lib/persistence";
import { getBrowserThemeStorage, getInitialTheme } from "./lib/theme";
import type {
  AsyncState,
  DashboardLoadState,
  PublicExercise,
  ReviewStatus,
  SnapshotDownload,
  Theme,
  ViewMode
} from "./lib/types";
import { REVIEWER_COMMENTS, VIEW_CONFIG, VIEW_ORDER } from "./lib/viewConfig";
import { CorpusView } from "./views/CorpusView";
import { CreateLanguageForm } from "./views/CreateLanguageForm";
import { ElderWorkspace } from "./views/ElderWorkspace";
import { EvaluationView } from "./views/EvaluationView";
import { GovernanceView } from "./views/GovernanceView";
import { IngestView } from "./views/IngestView";
import { LanguageProfileView } from "./views/LanguageProfileView";
import { LearnerView } from "./views/LearnerView";
import { ModelSetupView } from "./views/ModelSetupView";
import { NoLanguageNotice } from "./views/NoLanguageNotice";
import { ReviewView } from "./views/ReviewView";
import "./styles.css";

export { getInitialTheme } from "./lib/theme";

export function App() {
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [selectedLanguageId, setSelectedLanguageId] = useState<string | null>(null);
  const [languageIdToRestore, setLanguageIdToRestore] = useState<string | null>(getStoredLanguageId);
  const [loadState, setLoadState] = useState<DashboardLoadState>({ status: "loading" });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [profileState, setProfileState] = useState<AsyncState<LanguageProfile>>({ status: "idle" });

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isModelDrafting, setIsModelDrafting] = useState(false);
  const [modelDraftMessage, setModelDraftMessage] = useState<string | null>(null);
  const [modelDraftError, setModelDraftError] = useState<string | null>(null);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [exerciseAnswer, setExerciseAnswer] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [exerciseResult, setExerciseResult] = useState<string | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<PublicExerciseSubmission[]>([]);

  const [isElderMode, setIsElderMode] = useState(false);
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

  const [governanceState, setGovernanceState] = useState<AsyncState<GovernanceRecord[]>>({ status: "idle" });
  const [policyType, setPolicyType] = useState<GovernanceRecord["policyType"]>("generation");
  const [policyEffectiveDate, setPolicyEffectiveDate] = useState("");
  const [policyContent, setPolicyContent] = useState("");
  const [governanceSuccess, setGovernanceSuccess] = useState<string | null>(null);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [isSubmittingGovernance, setIsSubmittingGovernance] = useState(false);
  const [auditEventState, setAuditEventState] = useState<AsyncState<AuditEvent[]>>({ status: "idle" });
  const [reviewPolicyState, setReviewPolicyState] = useState<AsyncState<ReviewPolicy>>({ status: "idle" });
  const [reviewPolicyReviewerIds, setReviewPolicyReviewerIds] = useState("");
  const [reviewPolicyApprovalThreshold, setReviewPolicyApprovalThreshold] = useState("1");
  const [reviewPolicyRequiresAssigned, setReviewPolicyRequiresAssigned] = useState(true);
  const [reviewPolicySuccess, setReviewPolicySuccess] = useState<string | null>(null);
  const [reviewPolicyError, setReviewPolicyError] = useState<string | null>(null);
  const [isSubmittingReviewPolicy, setIsSubmittingReviewPolicy] = useState(false);
  const [reviewDispositionState, setReviewDispositionState] = useState<AsyncState<ReviewDisposition[]>>({ status: "idle" });
  const [reviewDispositionDrafts, setReviewDispositionDrafts] = useState<Record<string, string>>({});
  const [reviewDispositionSuccess, setReviewDispositionSuccess] = useState<string | null>(null);
  const [reviewDispositionError, setReviewDispositionError] = useState<string | null>(null);
  const [resolvingReviewDispositionId, setResolvingReviewDispositionId] = useState<string | null>(null);
  const [snapshotDownload, setSnapshotDownload] = useState<SnapshotDownload | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);
  const [evaluationArtifactDownload, setEvaluationArtifactDownload] = useState<SnapshotDownload | null>(null);
  const [evaluationArtifactError, setEvaluationArtifactError] = useState<string | null>(null);
  const [isExportingEvaluationArtifact, setIsExportingEvaluationArtifact] = useState(false);

  const [llmState, setLlmState] = useState<AsyncState<LlmStatus>>({ status: "idle" });
  const [observabilityState, setObservabilityState] = useState<AsyncState<ObservabilityData>>({ status: "idle" });
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<string | null>(null);
  const [modelTestIsPlaceholder, setModelTestIsPlaceholder] = useState(false);
  const [isCheckingReachability, setIsCheckingReachability] = useState(false);
  const [reachabilityResult, setReachabilityResult] = useState<LlmReachability | null>(null);
  const [reachabilityError, setReachabilityError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      getBrowserThemeStorage()?.setItem("theme", theme);
    } catch {
      // Ignore localStorage failures in test runners or locked-down browsers.
    }
  }, [theme]);

  useEffect(() => {
    persistWorkspaceSelection(view, selectedLanguageId);
  }, [view, selectedLanguageId]);

  // Restore the last-open language once the workspace list is known, so a
  // stale stored id can never wedge the dashboard request in an error state.
  useEffect(() => {
    if (loadState.status !== "ready" || languageIdToRestore === null) return;
    const exists = loadState.data.languages.some((language) => language.id === languageIdToRestore);
    setLanguageIdToRestore(null);
    if (exists && selectedLanguageId === null) {
      setSelectedLanguageId(languageIdToRestore);
    }
  }, [loadState, languageIdToRestore, selectedLanguageId]);

  useEffect(() => {
    let isCurrent = true;
    fetchCurrentUser()
      .then((user) => {
        if (isCurrent) setCurrentUser(user);
      })
      .catch(() => {
        if (isCurrent) setCurrentUser(null);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setLoadState({ status: "loading" });
    setExerciseResult(null);
    setExerciseAnswer("");
    setSelectedExerciseId(null);
    setSelectedNoteId(null);
    setSubmissionHistory([]);

    fetchDashboardData(selectedLanguageId ?? undefined)
      .then((data) => {
        if (isCurrent) setLoadState({ status: "ready", data });
      })
      .catch((error: Error) => {
        if (isCurrent) setLoadState({ status: "error", message: error.message });
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedLanguageId]);

  useEffect(() => {
    let isCurrent = true;
    if (view !== "profile" || !selectedLanguageId) {
      setProfileState({ status: "idle" });
      return () => {
        isCurrent = false;
      };
    }

    setProfileState({ status: "loading" });
    fetchLanguageProfile(selectedLanguageId)
      .then((profile) => {
        if (isCurrent) setProfileState({ status: "ready", data: profile });
      })
      .catch((error: Error) => {
        if (isCurrent) setProfileState({ status: "error", message: error.message });
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedLanguageId, view]);

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

  const data = loadState.status === "ready" ? loadState.data : null;
  const selectedLanguage = data?.languages.find((language) => language.id === selectedLanguageId) ?? null;
  const selectedNote = data?.notes.find((note) => note.id === selectedNoteId) ?? data?.notes[0] ?? null;
  const selectedExercise = data?.exercises.find((exercise) => exercise.id === selectedExerciseId) ?? data?.exercises[0] ?? null;
  const activeView = VIEW_CONFIG[view];
  const isWorkflowBusy = isEvaluating
    || isDrafting
    || isModelDrafting
    || reviewingNoteId !== null
    || isGrading
    || isSubmittingCorrection
    || reviewingCorrectionId !== null
    || applyingCorrectionId !== null
    || isSubmittingGovernance
    || isSubmittingReviewPolicy
    || resolvingReviewDispositionId !== null
    || isExportingSnapshot
    || isExportingEvaluationArtifact
    || isTestingModel;

  const overviewStats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Notes", value: data.notes.length.toString(), hint: "review queue" },
      { label: "Corpus", value: data.corpus.length.toString(), hint: "source records" },
      { label: "Exercises", value: data.exercises.length.toString(), hint: "learner tasks" },
      { label: "Evals", value: data.evaluations.length.toString(), hint: "quality runs" }
    ];
  }, [data]);

  useEffect(() => {
    let isCurrent = true;
    setExerciseAnswer("");
    setExerciseResult(null);

    if (view !== "learner" || !selectedExercise) {
      setSubmissionHistory([]);
      setIsLoadingSubmissions(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoadingSubmissions(true);
    fetchExerciseSubmissions(selectedExercise.id)
      .then((history) => {
        if (isCurrent) setSubmissionHistory(history);
      })
      .catch(() => {
        if (isCurrent) setSubmissionHistory([]);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingSubmissions(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedExercise?.id, view]);

  useEffect(() => {
    let isCurrent = true;
    if (view !== "model") return () => {
      isCurrent = false;
    };

    setLlmState({ status: "loading" });
    setObservabilityState({ status: "loading" });
    setModelTestResult(null);
    fetchLlmStatus()
      .then((status) => {
        if (isCurrent) setLlmState({ status: "ready", data: status });
      })
      .catch((error: Error) => {
        if (isCurrent) setLlmState({ status: "error", message: error.message });
      });
    fetchObservability()
      .then((observability) => {
        if (isCurrent) setObservabilityState({ status: "ready", data: observability });
      })
      .catch((error: Error) => {
        if (isCurrent) setObservabilityState({ status: "error", message: error.message });
      });

    return () => {
      isCurrent = false;
    };
  }, [view]);

  useEffect(() => {
    let isCurrent = true;
    if (view !== "governance" || !selectedLanguageId) {
      return () => {
        isCurrent = false;
      };
    }

    setGovernanceState({ status: "loading" });
    setAuditEventState({ status: "loading" });
    setReviewPolicyState({ status: "loading" });
    setReviewDispositionState({ status: "loading" });
    setGovernanceSuccess(null);
    setGovernanceError(null);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    fetchGovernance()
      .then((records) => {
        if (isCurrent) setGovernanceState({ status: "ready", data: records });
      })
      .catch((error: Error) => {
        if (isCurrent) setGovernanceState({ status: "error", message: error.message });
      });
    const reviewPolicyRequest = fetchReviewPolicy(selectedLanguageId)
      .then((policy) => {
        if (!isCurrent) return;
        setReviewPolicyState({ status: "ready", data: policy });
        setReviewPolicyReviewerIds(policy.assignedReviewerIds.join(", "));
        setReviewPolicyApprovalThreshold(policy.approvalThreshold.toString());
        setReviewPolicyRequiresAssigned(policy.requiresAssignedReviewer);
      })
      .catch((error: Error) => {
        if (isCurrent) setReviewPolicyState({ status: "error", message: error.message });
      });
    const reviewDispositionRequest = fetchReviewDispositions(selectedLanguageId)
      .then((dispositions) => {
        if (isCurrent) setReviewDispositionState({ status: "ready", data: dispositions });
      })
      .catch((error: Error) => {
        if (isCurrent) setReviewDispositionState({ status: "error", message: error.message });
      });
    Promise.allSettled([reviewPolicyRequest, reviewDispositionRequest])
      .then(() => {
        if (!isCurrent) return undefined;
        return fetchAuditEvents(selectedLanguageId)
          .then((events) => {
            if (isCurrent) setAuditEventState({ status: "ready", data: events });
          })
          .catch((error: Error) => {
            if (isCurrent) setAuditEventState({ status: "error", message: error.message });
          });
      });

    return () => {
      isCurrent = false;
    };
  }, [view, selectedLanguageId]);

  useEffect(() => {
    setPolicyType("generation");
    setPolicyEffectiveDate("");
    setPolicyContent("");
    setGovernanceSuccess(null);
    setGovernanceError(null);
    setAuditEventState({ status: "idle" });
    setReviewPolicyState({ status: "idle" });
    setReviewPolicyReviewerIds("");
    setReviewPolicyApprovalThreshold("1");
    setReviewPolicyRequiresAssigned(true);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);
    setReviewDispositionState({ status: "idle" });
    setReviewDispositionDrafts({});
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    setSnapshotDownload(null);
    setSnapshotError(null);
    setEvaluationArtifactDownload(null);
    setEvaluationArtifactError(null);
  }, [selectedLanguageId]);

  async function refreshDashboard() {
    const refreshed = await fetchDashboardData(selectedLanguageId ?? undefined);
    setLoadState({ status: "ready", data: refreshed });
  }

  async function refreshModelObservability() {
    setObservabilityState({ status: "loading" });
    try {
      setObservabilityState({ status: "ready", data: await fetchObservability() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model observability failed";
      setObservabilityState({ status: "error", message });
    }
  }

  function handleLanguageSelect(languageId: string) {
    setIsElderMode(false);
    setView("corpus");
    setSelectedLanguageId(languageId);
  }

  async function handleCreateLanguage(payload: LanguageCreatePayload) {
    const created = await createLanguage(payload);
    setIsElderMode(false);
    setView("corpus");
    setSelectedLanguageId(created.id);
  }

  function handleViewSelect(mode: ViewMode) {
    setIsElderMode(false);
    setView(mode);
  }

  async function handleRunEval() {
    setIsEvaluating(true);
    try {
      await runEvaluation();
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation run failed";
      setLoadState({ status: "error", message });
    } finally {
      setIsEvaluating(false);
    }
  }

  async function handleGenerateDrafts() {
    if (!selectedLanguageId) return;
    setIsDrafting(true);
    try {
      await generateDraftNotes(selectedLanguageId);
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Draft generation failed";
      setLoadState({ status: "error", message });
    } finally {
      setIsDrafting(false);
    }
  }

  async function handleGenerateModelDrafts() {
    if (!selectedLanguageId) return;
    setIsModelDrafting(true);
    setModelDraftMessage(null);
    setModelDraftError(null);
    try {
      const { generated, warnings } = await generateModelDraftNotes(selectedLanguageId);
      await refreshDashboard();
      const summary = `Generated ${generated} model-backed draft note${generated === 1 ? "" : "s"}.`;
      setModelDraftMessage(warnings.length > 0 ? `${summary} ${warnings.join(" ")}` : summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model draft generation failed";
      setModelDraftError(message);
    } finally {
      setIsModelDrafting(false);
    }
  }

  async function handleReview(status: ReviewStatus) {
    if (!selectedNote) return;
    setReviewingNoteId(selectedNote.id);
    try {
      await reviewNote(selectedNote.id, {
        status,
        reviewerComment: REVIEWER_COMMENTS[status]
      });
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Note review failed";
      setLoadState({ status: "error", message });
    } finally {
      setReviewingNoteId(null);
    }
  }

  async function handleSaveNoteExplanation(explanation: string) {
    if (!selectedNote) return;
    setReviewingNoteId(selectedNote.id);
    try {
      await reviewNote(selectedNote.id, {
        explanation,
        reviewerComment: "Edited note explanation in local prototype."
      });
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Note explanation update failed";
      setLoadState({ status: "error", message });
      throw error;
    } finally {
      setReviewingNoteId(null);
    }
  }

  async function handleGrade() {
    const submittedAnswer = exerciseAnswer.trim();
    if (!selectedExercise || submittedAnswer.length === 0) return;

    setIsGrading(true);
    setExerciseResult(null);
    try {
      const submission = await submitExerciseAnswer(selectedExercise.id, submittedAnswer);
      setExerciseResult(submission.explanation);
      setSubmissionHistory(await fetchExerciseSubmissions(selectedExercise.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Exercise submission failed";
      setExerciseResult(message);
    } finally {
      setIsGrading(false);
    }
  }

  async function handleCreateExercise(payload: ExerciseAuthoringPayload) {
    if (!selectedLanguageId) {
      throw new Error("Select or create a language first.");
    }
    const created = await createExercise(selectedLanguageId, payload);
    await refreshDashboard();
    setSelectedExerciseId(created.id);
    setExerciseAnswer("");
    setExerciseResult(null);
    setSubmissionHistory([]);
  }

  async function handleGenerateExercise(
    options?: { type?: string }
  ): Promise<{ exercise: GeneratedExerciseDraft; warnings: string[] }> {
    if (!selectedLanguageId) {
      throw new Error("Select or create a language first.");
    }
    return generateModelExercise(selectedLanguageId, options);
  }

  async function handleImportCorpusPassage(payload: CorpusImportPayload) {
    if (!selectedLanguageId) {
      throw new Error("Select or create a language first.");
    }
    await importCorpusPassage(selectedLanguageId, payload);
    await refreshDashboard();
  }

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

  async function handleSubmitGovernance(event: FormEvent) {
    event.preventDefault();
    const content = policyContent.trim();
    const effectiveDate = policyEffectiveDate.trim();

    if (!content || !effectiveDate) {
      setGovernanceSuccess(null);
      setGovernanceError("Please provide policy content and an effective date.");
      return;
    }

    if (!selectedLanguageId) {
      setGovernanceSuccess(null);
      setGovernanceError("Select or create a language first.");
      return;
    }

    setIsSubmittingGovernance(true);
    setGovernanceSuccess(null);
    setGovernanceError(null);

    const payload: GovernancePayload = {
      languageId: selectedLanguageId,
      policyType,
      content,
      effectiveDate
    };

    try {
      await createGovernanceRecord(payload);
      setPolicyContent("");
      setGovernanceSuccess("Governance policy recorded.");
      setGovernanceState({ status: "ready", data: await fetchGovernance() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Governance policy creation failed";
      setGovernanceError(message);
    } finally {
      setIsSubmittingGovernance(false);
    }
  }

  async function handleSubmitReviewPolicy(event: FormEvent) {
    event.preventDefault();
    const assignedReviewerIds = parseReviewerIds(reviewPolicyReviewerIds);
    const approvalThreshold = Number.parseInt(reviewPolicyApprovalThreshold, 10);

    if (assignedReviewerIds.length === 0) {
      setReviewPolicySuccess(null);
      setReviewPolicyError("Please provide at least one assigned reviewer ID.");
      return;
    }

    if (!Number.isInteger(approvalThreshold) || approvalThreshold < 1) {
      setReviewPolicySuccess(null);
      setReviewPolicyError("Approval threshold must be a positive whole number.");
      return;
    }

    if (reviewPolicyRequiresAssigned && approvalThreshold > assignedReviewerIds.length) {
      setReviewPolicySuccess(null);
      setReviewPolicyError("Approval threshold cannot exceed assigned reviewers.");
      return;
    }

    if (!selectedLanguageId) {
      setReviewPolicySuccess(null);
      setReviewPolicyError("Select or create a language first.");
      return;
    }

    const payload: ReviewPolicyPayload = {
      assignedReviewerIds,
      approvalThreshold,
      requiresAssignedReviewer: reviewPolicyRequiresAssigned
    };

    setIsSubmittingReviewPolicy(true);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);

    try {
      const policy = await updateReviewPolicy(selectedLanguageId, payload);
      setReviewPolicyState({ status: "ready", data: policy });
      setReviewPolicyReviewerIds(policy.assignedReviewerIds.join(", "));
      setReviewPolicyApprovalThreshold(policy.approvalThreshold.toString());
      setReviewPolicyRequiresAssigned(policy.requiresAssignedReviewer);
      setReviewPolicySuccess("Review policy updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review policy update failed";
      setReviewPolicyError(message);
    } finally {
      setIsSubmittingReviewPolicy(false);
    }
  }

  async function handleResolveReviewDisposition(dispositionId: string) {
    const resolutionSummary = (reviewDispositionDrafts[dispositionId] ?? "").trim();
    if (resolutionSummary.length === 0) {
      setReviewDispositionSuccess(null);
      setReviewDispositionError("Resolution summary is required.");
      return;
    }

    if (!selectedLanguageId) {
      setReviewDispositionSuccess(null);
      setReviewDispositionError("Select or create a language first.");
      return;
    }

    setResolvingReviewDispositionId(dispositionId);
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    try {
      await resolveReviewDisposition(dispositionId, resolutionSummary);
      const [dispositions] = await Promise.all([
        fetchReviewDispositions(selectedLanguageId),
        refreshDashboard()
      ]);
      setReviewDispositionState({ status: "ready", data: dispositions });
      setReviewDispositionDrafts((drafts) => ({ ...drafts, [dispositionId]: "" }));
      setReviewDispositionSuccess("Review disposition resolved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review disposition resolution failed";
      setReviewDispositionError(message);
    } finally {
      setResolvingReviewDispositionId(null);
    }
  }

  async function handleExportSnapshot() {
    if (!selectedLanguageId) {
      setSnapshotDownload(null);
      setSnapshotError("Select or create a language first.");
      return;
    }

    setIsExportingSnapshot(true);
    setSnapshotDownload(null);
    setSnapshotError(null);

    try {
      const snapshot = await fetchLanguageSnapshot(selectedLanguageId);
      setSnapshotDownload(buildSnapshotDownload(snapshot));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot export failed";
      setSnapshotError(message);
    } finally {
      setIsExportingSnapshot(false);
    }
  }

  async function handleExportEvaluationArtifact() {
    setIsExportingEvaluationArtifact(true);
    setEvaluationArtifactDownload(null);
    setEvaluationArtifactError(null);

    try {
      const artifact = await fetchEvaluationArtifact();
      setEvaluationArtifactDownload(buildEvaluationArtifactDownload(artifact));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation artifact export failed";
      setEvaluationArtifactError(message);
    } finally {
      setIsExportingEvaluationArtifact(false);
    }
  }

  async function handleModelSmokeTest() {
    if (!data) return;
    if (!selectedLanguageId) {
      setModelTestResult("Select or create a language first.");
      return;
    }
    setIsTestingModel(true);
    setModelTestResult(null);
    setModelTestIsPlaceholder(false);
    try {
      const session = await createAiSession({
        languageId: selectedLanguageId,
        mode: "learner_practice",
        seedPrompt: "Create one concise, safe practice prompt using only the provided public workspace context.",
        contextNoteIds: data.notes.slice(0, 2).map((note) => note.id),
        contextPassageIds: data.corpus.slice(0, 2).map((passage) => passage.id)
      });
      setModelTestResult(latestAssistantMessage(session));
      const refreshedStatus = await fetchLlmStatus();
      setLlmState({ status: "ready", data: refreshedStatus });
      // The reply is a genuine model answer only when a real provider is
      // configured. Deterministic/invalid modes return a canned offline string,
      // and the session trace may flag the deterministic fallback as well.
      setModelTestIsPlaceholder(!isRealModelProvider(refreshedStatus) || sessionUsedDeterministicFallback(session));
      await refreshModelObservability();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model smoke test failed";
      setModelTestResult(message);
      setModelTestIsPlaceholder(false);
      await refreshModelObservability();
    } finally {
      setIsTestingModel(false);
    }
  }

  async function handleTestConnection() {
    setIsCheckingReachability(true);
    setReachabilityError(null);
    setReachabilityResult(null);
    try {
      setReachabilityResult(await checkLlmReachability());
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM reachability check failed";
      setReachabilityError(message);
    } finally {
      setIsCheckingReachability(false);
    }
  }

  if (loadState.status === "loading") {
    return <StatusScreen kind="loading" message="Loading workspace..." />;
  }

  if (loadState.status === "error") {
    return <StatusScreen kind="error" message={loadState.message} />;
  }

  if (!data) {
    return <StatusScreen kind="error" message="Workspace data is unavailable." />;
  }

  const currentTitle = isElderMode ? "Elder Workspace" : activeView.title;
  const currentEyebrow = isElderMode ? "Elder review" : activeView.eyebrow;
  const currentBreadcrumb = `${selectedLanguage?.name ?? "Language"} / ${isElderMode ? "Elder workspace" : activeView.label}`;
  const sectionCounts: Partial<Record<ViewMode, number>> = {
    corpus: data.corpus.length,
    review: data.notes.length,
    learner: data.exercises.length,
    eval: data.evaluations.length
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Atlas language sidebar">
        <div className="brand-card">
          <div className="brand-mark">
            <CompassMark />
          </div>
          <div className="brand-copy">
            <p className="brand-kicker">AssiniLang</p>
            <strong>Language preservation</strong>
            <span>Research console</span>
          </div>
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>

        <DiamondBand />

        <div className="sidebar-section-label">Languages</div>
        <nav className="language-nav" aria-label="Languages">
          {data.languages.length === 0 && (
            <p className="empty-state">No languages yet. Use New language below to start a workspace.</p>
          )}
          {data.languages.map((language) => {
            const isActive = language.id === selectedLanguageId;
            return (
              <div className="language-nav-group" key={language.id}>
                <button
                  type="button"
                  className={`language-button${isActive ? " active" : ""}`}
                  aria-pressed={isActive}
                  disabled={isWorkflowBusy}
                  onClick={() => handleLanguageSelect(language.id)}
                >
                  <span className="typology-frame">
                    <TypologyMark typology={language.typology} />
                  </span>
                  <span className="language-copy">
                    <strong>{language.name}</strong>
                    <span>{language.typology}</span>
                  </span>
                </button>

                {isActive && (
                  <nav className="section-nav" aria-label={`${language.name} sections`}>
                    {VIEW_ORDER.map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        className={view === mode && !isElderMode ? "active" : ""}
                        aria-current={view === mode && !isElderMode ? "page" : undefined}
                        disabled={isWorkflowBusy}
                        onClick={() => handleViewSelect(mode)}
                      >
                        <ViewGlyph view={mode} />
                        <span>{VIEW_CONFIG[mode].label}</span>
                        {sectionCounts[mode] != null && <span className="section-count" aria-hidden="true">{sectionCounts[mode]}</span>}
                      </button>
                    ))}
                  </nav>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <CreateLanguageForm isWorkflowBusy={isWorkflowBusy} onCreate={handleCreateLanguage} />
          <div className="user-card">
            <span>Signed in</span>
            <strong>{currentUser?.name ?? "Local User"}</strong>
          </div>
        </div>
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1} aria-busy={isWorkflowBusy}>
        <div className="prototype-notice">
          <strong>Local prototype</strong>
          <span>all data stays on this machine</span>
        </div>

        <section className="workspace-header" aria-label="Workspace overview">
          <div className="star-field" aria-hidden="true" />
          <div className="title-block">
            <p className="breadcrumb">{currentBreadcrumb}</p>
            <p className="eyebrow">{currentEyebrow}</p>
            <h1>{currentTitle}</h1>
            <div className="language-metadata" aria-label="Selected language metadata">
              <span>{selectedLanguage?.typology ?? "unknown"}</span>
              <span>{formatOrthographyMeta(selectedLanguage?.orthography)}</span>
              <span>{selectedLanguage?.status ?? "draft"} workspace</span>
            </div>
          </div>

          <div className="header-actions">
            <button type="button" className="secondary" onClick={() => setIsElderMode((current) => !current)}>
              {isElderMode ? "Back to dashboard" : "Elder workspace"}
            </button>
            {!isElderMode && view === "review" && (
              <>
                <button type="button" onClick={handleGenerateDrafts} disabled={isWorkflowBusy}>
                  {isDrafting ? "Drafting..." : "Generate AI Drafts"}
                </button>
                <button type="button" onClick={handleGenerateModelDrafts} disabled={isWorkflowBusy}>
                  {isModelDrafting ? "Drafting with model..." : "Draft notes with model"}
                </button>
                {modelDraftMessage && (
                  <p className="result-notice header-notice" role="status" aria-live="polite">
                    {modelDraftMessage}
                  </p>
                )}
                {modelDraftError && (
                  <p className="result-notice error header-notice" role="alert">
                    {modelDraftError}
                  </p>
                )}
              </>
            )}
            {!isElderMode && view === "eval" && (
              <button type="button" onClick={handleRunEval} disabled={isWorkflowBusy}>
                {isEvaluating ? "Evaluating..." : "Run System Eval"}
              </button>
            )}
          </div>
        </section>

        <DiamondBand compact />

        <section className="stat-strip" aria-label="Current language overview">
          {overviewStats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <em>{stat.hint}</em>
            </div>
          ))}
        </section>

        <section className="view-container" aria-labelledby="current-view-title">
          <h2 id="current-view-title" className="visually-hidden">
            {currentTitle}
          </h2>

          {isElderMode ? (
            <ElderWorkspace
              data={data}
              elderContext={elderContext}
              isLoadingElder={isLoadingElder}
              formNoteId={formNoteId}
              formPassageId={formPassageId}
              formSeverity={formSeverity}
              formCorrection={formCorrection}
              formRationale={formRationale}
              formContextText={formContextText}
              correctionSuccess={correctionSuccess}
              correctionError={correctionError}
              isWorkflowBusy={isWorkflowBusy}
              isSubmittingCorrection={isSubmittingCorrection}
              reviewingCorrectionId={reviewingCorrectionId}
              applyingCorrectionId={applyingCorrectionId}
              correctionApplyDrafts={correctionApplyDrafts}
              onSubmit={handleSubmitCorrection}
              onNoteChange={(value) => {
                setFormNoteId(value);
                if (value) setFormPassageId("");
              }}
              onPassageChange={(value) => {
                setFormPassageId(value);
                if (value) setFormNoteId("");
              }}
              onSeverityChange={setFormSeverity}
              onCorrectionChange={setFormCorrection}
              onRationaleChange={setFormRationale}
              onContextChange={setFormContextText}
              onReviewCorrection={handleReviewCorrection}
              onApplyDraftChange={(correctionId, explanation) => {
                setCorrectionApplyDrafts((current) => ({ ...current, [correctionId]: explanation }));
              }}
              onApplyCorrection={handleApplyCorrection}
            />
          ) : (
            <>
              {view === "profile" && (
                selectedLanguageId ? <LanguageProfileView profileState={profileState} /> : <NoLanguageNotice />
              )}
              {view === "ingest" && (
                selectedLanguageId ? <IngestView languageId={selectedLanguageId} /> : <NoLanguageNotice />
              )}
              {view === "corpus" && (
                <CorpusView
                  corpus={data.corpus}
                  isWorkflowBusy={isWorkflowBusy}
                  onImportCorpusPassage={handleImportCorpusPassage}
                />
              )}
              {view === "review" && (
                <ReviewView
                  notes={data.notes}
                  selectedNote={selectedNote}
                  isWorkflowBusy={isWorkflowBusy}
                  reviewingNoteId={reviewingNoteId}
                  onSelectNote={setSelectedNoteId}
                  onReview={handleReview}
                  onSaveExplanation={handleSaveNoteExplanation}
                />
              )}
              {view === "learner" && (
                <LearnerView
                  exercises={data.exercises}
                  selectedExercise={selectedExercise}
                  selectedExerciseId={selectedExerciseId}
                  isWorkflowBusy={isWorkflowBusy}
                  exerciseAnswer={exerciseAnswer}
                  isGrading={isGrading}
                  exerciseResult={exerciseResult}
                  isLoadingSubmissions={isLoadingSubmissions}
                  submissionHistory={submissionHistory}
                  onSelectExercise={setSelectedExerciseId}
                  onAnswerChange={setExerciseAnswer}
                  onGrade={handleGrade}
                  onCreateExercise={handleCreateExercise}
                  onGenerateExercise={handleGenerateExercise}
                />
              )}
              {view === "eval" && (
                <EvaluationView
                  evaluations={data.evaluations}
                  languages={data.languages}
                  selectedLanguageId={selectedLanguageId}
                  isWorkflowBusy={isWorkflowBusy}
                  artifactDownload={evaluationArtifactDownload}
                  artifactError={evaluationArtifactError}
                  isExportingArtifact={isExportingEvaluationArtifact}
                  onExportArtifact={handleExportEvaluationArtifact}
                />
              )}
              {view === "governance" && !selectedLanguageId && <NoLanguageNotice />}
              {view === "governance" && selectedLanguageId && (
                <GovernanceView
                  selectedLanguageId={selectedLanguageId}
                  governanceState={governanceState}
                  auditEventState={auditEventState}
                  policyType={policyType}
                  policyEffectiveDate={policyEffectiveDate}
                  policyContent={policyContent}
                  governanceSuccess={governanceSuccess}
                  governanceError={governanceError}
                  isSubmittingGovernance={isSubmittingGovernance}
                  reviewPolicyState={reviewPolicyState}
                  reviewPolicyReviewerIds={reviewPolicyReviewerIds}
                  reviewPolicyApprovalThreshold={reviewPolicyApprovalThreshold}
                  reviewPolicyRequiresAssigned={reviewPolicyRequiresAssigned}
                  reviewPolicySuccess={reviewPolicySuccess}
                  reviewPolicyError={reviewPolicyError}
                  isSubmittingReviewPolicy={isSubmittingReviewPolicy}
                  reviewDispositionState={reviewDispositionState}
                  reviewDispositionDrafts={reviewDispositionDrafts}
                  reviewDispositionSuccess={reviewDispositionSuccess}
                  reviewDispositionError={reviewDispositionError}
                  resolvingReviewDispositionId={resolvingReviewDispositionId}
                  snapshotDownload={snapshotDownload}
                  snapshotError={snapshotError}
                  isExportingSnapshot={isExportingSnapshot}
                  onPolicyTypeChange={setPolicyType}
                  onEffectiveDateChange={setPolicyEffectiveDate}
                  onContentChange={setPolicyContent}
                  onSubmit={handleSubmitGovernance}
                  onReviewPolicyReviewerIdsChange={setReviewPolicyReviewerIds}
                  onReviewPolicyApprovalThresholdChange={setReviewPolicyApprovalThreshold}
                  onReviewPolicyRequiresAssignedChange={setReviewPolicyRequiresAssigned}
                  onReviewPolicySubmit={handleSubmitReviewPolicy}
                  onReviewDispositionDraftChange={(dispositionId, summary) => {
                    setReviewDispositionDrafts((drafts) => ({ ...drafts, [dispositionId]: summary }));
                  }}
                  onResolveReviewDisposition={handleResolveReviewDisposition}
                  onExportSnapshot={handleExportSnapshot}
                />
              )}
              {view === "model" && (
                <ModelSetupView
                  llmState={llmState}
                  observabilityState={observabilityState}
                  isTestingModel={isTestingModel}
                  modelTestResult={modelTestResult}
                  modelTestIsPlaceholder={modelTestIsPlaceholder}
                  onSmokeTest={handleModelSmokeTest}
                  isCheckingReachability={isCheckingReachability}
                  reachabilityResult={reachabilityResult}
                  reachabilityError={reachabilityError}
                  onTestConnection={handleTestConnection}
                />
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
