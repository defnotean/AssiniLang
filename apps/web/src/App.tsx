import { useEffect, useMemo, useState } from "react";
import type { User } from "@assini/db";
import type {
  CorpusImportPayload,
  LanguageCreatePayload,
  LanguageProfile
} from "./api";
import {
  createLanguage,
  fetchCurrentUser,
  fetchDashboardData,
  fetchLanguageProfile,
  generateDraftNotes,
  generateModelDraftNotes,
  importCorpusPassage,
  reviewNote,
  runEvaluation
} from "./api";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { SignOutButton } from "./components/SignOutButton";
import { StatusScreen } from "./components/StatusScreen";
import { CompassMark, DiamondBand, TypologyMark, ViewGlyph } from "./components/marks";
import { formatOrthographyMeta } from "./lib/format";
import { getInitialView, getStoredLanguageId, persistWorkspaceSelection } from "./lib/persistence";
import { getBrowserThemeStorage, getInitialTheme } from "./lib/theme";
import type {
  AsyncState,
  DashboardLoadState,
  ReviewStatus,
  Theme,
  ViewMode
} from "./lib/types";
import { REVIEWER_COMMENTS, VIEW_CONFIG, VIEW_ORDER } from "./lib/viewConfig";
import { useElderWorkspace } from "./hooks/useElderWorkspace";
import { useGovernanceWorkspace } from "./hooks/useGovernanceWorkspace";
import { useLearnerWorkspace } from "./hooks/useLearnerWorkspace";
import { useModelWorkspace } from "./hooks/useModelWorkspace";
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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isModelDrafting, setIsModelDrafting] = useState(false);
  const [modelDraftMessage, setModelDraftMessage] = useState<string | null>(null);
  const [modelDraftError, setModelDraftError] = useState<string | null>(null);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const [isElderMode, setIsElderMode] = useState(false);

  const data = loadState.status === "ready" ? loadState.data : null;

  const model = useModelWorkspace(view, selectedLanguageId, data);
  const elder = useElderWorkspace(selectedLanguageId, isElderMode, refreshDashboard, model.refreshModelObservability);
  const learner = useLearnerWorkspace(view, selectedLanguageId, data, refreshDashboard);
  const governance = useGovernanceWorkspace(selectedLanguageId, view, refreshDashboard);

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

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

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
    learner.setExerciseResult(null);
    learner.setExerciseAnswer("");
    learner.setSelectedExerciseId(null);
    setSelectedNoteId(null);
    learner.setSubmissionHistory([]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const selectedLanguage = data?.languages.find((language) => language.id === selectedLanguageId) ?? null;
  const selectedNote = data?.notes.find((note) => note.id === selectedNoteId) ?? data?.notes[0] ?? null;
  const selectedExercise = learner.selectedExercise;
  const activeView = VIEW_CONFIG[view];
  const isWorkflowBusy = isEvaluating
    || isDrafting
    || isModelDrafting
    || reviewingNoteId !== null
    || learner.isGrading
    || elder.isSubmittingCorrection
    || elder.reviewingCorrectionId !== null
    || elder.applyingCorrectionId !== null
    || governance.isSubmittingGovernance
    || governance.isSubmittingReviewPolicy
    || governance.resolvingReviewDispositionId !== null
    || governance.isExportingSnapshot
    || governance.isExportingEvaluationArtifact
    || model.isTestingModel;

  const overviewStats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Notes", value: data.notes.length.toString(), hint: "review queue" },
      { label: "Corpus", value: data.corpus.length.toString(), hint: "source records" },
      { label: "Exercises", value: data.exercises.length.toString(), hint: "learner tasks" },
      { label: "Evals", value: data.evaluations.length.toString(), hint: "quality runs" }
    ];
  }, [data]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const languageCommands: PaletteCommand[] = (data?.languages ?? []).map((language) => ({
      id: `language-${language.id}`,
      label: `Go to ${language.name}`,
      run: () => handleLanguageSelect(language.id)
    }));
    const viewCommands: PaletteCommand[] = VIEW_ORDER.map((mode) => ({
      id: `view-${mode}`,
      label: `Open ${VIEW_CONFIG[mode].label}`,
      run: () => handleViewSelect(mode)
    }));
    return [
      ...languageCommands,
      ...viewCommands,
      {
        id: "toggle-theme",
        label: "Toggle theme",
        run: () => setTheme((current) => (current === "dark" ? "light" : "dark"))
      }
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function refreshDashboard() {
    const refreshed = await fetchDashboardData(selectedLanguageId ?? undefined);
    setLoadState({ status: "ready", data: refreshed });
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
      const { generated, warnings, notes } = await generateModelDraftNotes(selectedLanguageId);
      await refreshDashboard();
      const summary = `Generated ${generated} model-backed draft note${generated === 1 ? "" : "s"}.`;
      const scored = notes?.filter((note) => note.grounding) ?? [];
      const groundingSummary = scored.length > 0
        ? ` Grounding: ${scored
            .map((note) => `${Math.round((note.grounding?.score ?? 0) * 100)}%`)
            .join(", ")}.${scored.some((note) => (note.grounding?.failures.length ?? 0) > 0) ? " Review flagged checks before approving." : ""}`
        : "";
      setModelDraftMessage(
        warnings.length > 0 ? `${summary}${groundingSummary} ${warnings.join(" ")}` : `${summary}${groundingSummary}`
      );
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

  async function handleImportCorpusPassage(payload: CorpusImportPayload) {
    if (!selectedLanguageId) {
      throw new Error("Select or create a language first.");
    }
    await importCorpusPassage(selectedLanguageId, payload);
    await refreshDashboard();
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
    <>
      {isPaletteOpen && (
        <CommandPalette commands={paletteCommands} onClose={() => setIsPaletteOpen(false)} />
      )}
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
            <SignOutButton />
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
              elderContext={elder.elderContext}
              isLoadingElder={elder.isLoadingElder}
              formNoteId={elder.formNoteId}
              formPassageId={elder.formPassageId}
              formSeverity={elder.formSeverity}
              formCorrection={elder.formCorrection}
              formRationale={elder.formRationale}
              formContextText={elder.formContextText}
              correctionSuccess={elder.correctionSuccess}
              correctionError={elder.correctionError}
              isWorkflowBusy={isWorkflowBusy}
              isSubmittingCorrection={elder.isSubmittingCorrection}
              reviewingCorrectionId={elder.reviewingCorrectionId}
              applyingCorrectionId={elder.applyingCorrectionId}
              correctionApplyDrafts={elder.correctionApplyDrafts}
              onSubmit={elder.handleSubmitCorrection}
              onNoteChange={(value) => {
                elder.setFormNoteId(value);
                if (value) elder.setFormPassageId("");
              }}
              onPassageChange={(value) => {
                elder.setFormPassageId(value);
                if (value) elder.setFormNoteId("");
              }}
              onSeverityChange={elder.setFormSeverity}
              onCorrectionChange={elder.setFormCorrection}
              onRationaleChange={elder.setFormRationale}
              onContextChange={elder.setFormContextText}
              onReviewCorrection={elder.handleReviewCorrection}
              onApplyDraftChange={(correctionId, explanation) => {
                elder.setCorrectionApplyDrafts((current) => ({ ...current, [correctionId]: explanation }));
              }}
              onApplyCorrection={elder.handleApplyCorrection}
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
                  languageId={selectedLanguageId}
                  exercises={data.exercises}
                  selectedExercise={selectedExercise}
                  selectedExerciseId={learner.selectedExerciseId}
                  isWorkflowBusy={isWorkflowBusy}
                  exerciseAnswer={learner.exerciseAnswer}
                  isGrading={learner.isGrading}
                  exerciseResult={learner.exerciseResult}
                  isLoadingSubmissions={learner.isLoadingSubmissions}
                  submissionHistory={learner.submissionHistory}
                  onSelectExercise={learner.setSelectedExerciseId}
                  onAnswerChange={learner.setExerciseAnswer}
                  onGrade={learner.handleGrade}
                  onCreateExercise={learner.handleCreateExercise}
                  onGenerateExercise={learner.handleGenerateExercise}
                />
              )}
              {view === "eval" && (
                <EvaluationView
                  evaluations={data.evaluations}
                  languages={data.languages}
                  selectedLanguageId={selectedLanguageId}
                  isWorkflowBusy={isWorkflowBusy}
                  artifactDownload={governance.evaluationArtifactDownload}
                  artifactError={governance.evaluationArtifactError}
                  isExportingArtifact={governance.isExportingEvaluationArtifact}
                  onExportArtifact={governance.handleExportEvaluationArtifact}
                />
              )}
              {view === "governance" && !selectedLanguageId && <NoLanguageNotice />}
              {view === "governance" && selectedLanguageId && (
                <GovernanceView
                  selectedLanguageId={selectedLanguageId}
                  governanceState={governance.governanceState}
                  auditEventState={governance.auditEventState}
                  policyType={governance.policyType}
                  policyEffectiveDate={governance.policyEffectiveDate}
                  policyContent={governance.policyContent}
                  governanceSuccess={governance.governanceSuccess}
                  governanceError={governance.governanceError}
                  isSubmittingGovernance={governance.isSubmittingGovernance}
                  reviewPolicyState={governance.reviewPolicyState}
                  reviewPolicyReviewerIds={governance.reviewPolicyReviewerIds}
                  reviewPolicyApprovalThreshold={governance.reviewPolicyApprovalThreshold}
                  reviewPolicyRequiresAssigned={governance.reviewPolicyRequiresAssigned}
                  reviewPolicySuccess={governance.reviewPolicySuccess}
                  reviewPolicyError={governance.reviewPolicyError}
                  isSubmittingReviewPolicy={governance.isSubmittingReviewPolicy}
                  reviewDispositionState={governance.reviewDispositionState}
                  reviewDispositionDrafts={governance.reviewDispositionDrafts}
                  reviewDispositionSuccess={governance.reviewDispositionSuccess}
                  reviewDispositionError={governance.reviewDispositionError}
                  resolvingReviewDispositionId={governance.resolvingReviewDispositionId}
                  snapshotDownload={governance.snapshotDownload}
                  snapshotError={governance.snapshotError}
                  isExportingSnapshot={governance.isExportingSnapshot}
                  onPolicyTypeChange={governance.setPolicyType}
                  onEffectiveDateChange={governance.setPolicyEffectiveDate}
                  onContentChange={governance.setPolicyContent}
                  onSubmit={governance.handleSubmitGovernance}
                  onReviewPolicyReviewerIdsChange={governance.setReviewPolicyReviewerIds}
                  onReviewPolicyApprovalThresholdChange={governance.setReviewPolicyApprovalThreshold}
                  onReviewPolicyRequiresAssignedChange={governance.setReviewPolicyRequiresAssigned}
                  onReviewPolicySubmit={governance.handleSubmitReviewPolicy}
                  onReviewDispositionDraftChange={(dispositionId, summary) => {
                    governance.setReviewDispositionDrafts((drafts) => ({ ...drafts, [dispositionId]: summary }));
                  }}
                  onResolveReviewDisposition={governance.handleResolveReviewDisposition}
                  onExportSnapshot={governance.handleExportSnapshot}
                />
              )}
              {view === "model" && (
                <ModelSetupView
                  llmState={model.llmState}
                  observabilityState={model.observabilityState}
                  isTestingModel={model.isTestingModel}
                  modelTestResult={model.modelTestResult}
                  modelTestIsPlaceholder={model.modelTestIsPlaceholder}
                  onSmokeTest={model.handleModelSmokeTest}
                  isCheckingReachability={model.isCheckingReachability}
                  reachabilityResult={model.reachabilityResult}
                  reachabilityError={model.reachabilityError}
                  onTestConnection={model.handleTestConnection}
                />
              )}
            </>
          )}
        </section>
      </main>
      </div>
    </>
  );
}
