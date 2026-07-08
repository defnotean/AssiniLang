import { useEffect, useMemo, useState } from "react";
import type { User } from "@assini/db";
import type {
  CorpusImportPayload,
  LanguageCreatePayload
} from "./api";
import {
  createLanguage,
  deleteLanguage,
  fetchCurrentUser,
  fetchDashboardData,
  importCorpusPassage
} from "./api";
import { CommandPalette } from "./components/CommandPalette";
import { SignOutButton } from "./components/SignOutButton";
import { SidebarLanguageNav } from "./components/SidebarLanguageNav";
import { StatusScreen } from "./components/StatusScreen";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { CompassMark, DiamondBand } from "./components/marks";
import { getInitialView, getStoredLanguageId, persistWorkspaceSelection } from "./lib/persistence";
import { getBrowserThemeStorage, getInitialTheme } from "./lib/theme";
import type {
  DashboardLoadState,
  Theme,
  ViewMode
} from "./lib/types";
import { useI18n } from "./i18n";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { useAssistantWorkspace } from "./hooks/useAssistantWorkspace";
import { useElderWorkspace } from "./hooks/useElderWorkspace";
import { useGovernanceWorkspace } from "./hooks/useGovernanceWorkspace";
import { useLearnerWorkspace } from "./hooks/useLearnerWorkspace";
import { useModelWorkspace } from "./hooks/useModelWorkspace";
import { useReviewWorkspace } from "./hooks/useReviewWorkspace";
import { useWorkspacePaletteCommands } from "./hooks/useWorkspacePaletteCommands";
import { TOUR_STEPS, useWorkspaceTour } from "./hooks/useWorkspaceTour";
import { AssistantView } from "./views/AssistantView";
import { CorpusView } from "./views/CorpusView";
import { CreateLanguageForm } from "./views/CreateLanguageForm";
import { DeleteLanguageForm } from "./views/DeleteLanguageForm";
import { ElderPage } from "./views/ElderPage";
import { EvaluationView } from "./views/EvaluationView";
import { GovernanceView } from "./views/GovernanceView";
import { IngestView } from "./views/IngestView";
import { LearnerView } from "./views/LearnerView";
import { ModelSetupView } from "./views/ModelSetupView";
import { NoLanguageNotice } from "./views/NoLanguageNotice";
import { ReviewView } from "./views/ReviewView";
import { GuidedTour } from "./components/GuidedTour";
import "./styles.css";

export { getInitialTheme } from "./lib/theme";

export function App() {
  const { t } = useI18n();
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [selectedLanguageId, setSelectedLanguageId] = useState<string | null>(null);
  const [languageIdToRestore, setLanguageIdToRestore] = useState<string | null>(getStoredLanguageId);
  const [loadState, setLoadState] = useState<DashboardLoadState>({ status: "loading" });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const { showTour, setShowTour, dismissTour } = useWorkspaceTour();
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);

  const data = loadState.status === "ready" ? loadState.data : null;

  const model = useModelWorkspace(view, selectedLanguageId, data);
  const elder = useElderWorkspace(selectedLanguageId, view === "ingest", refreshDashboard, model.refreshModelObservability);
  const learner = useLearnerWorkspace(view, selectedLanguageId, data, refreshDashboard);
  const governance = useGovernanceWorkspace(selectedLanguageId, view, refreshDashboard);
  const assistant = useAssistantWorkspace();
  const review = useReviewWorkspace(view, selectedLanguageId, data, refreshDashboard);

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
    } else if (selectedLanguageId === null && loadState.data.languages.length > 0) {
      setSelectedLanguageId(loadState.data.languages[0]?.id ?? null);
    }
  }, [loadState, languageIdToRestore, selectedLanguageId]);

  useEffect(() => {
    if (loadState.status !== "ready" || languageIdToRestore !== null || selectedLanguageId !== null) return;
    if (loadState.data.languages.length > 0) {
      setSelectedLanguageId(loadState.data.languages[0]?.id ?? null);
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
    review.setSelectedNoteId(null);
    review.setReviewActionError(null);
    review.setWorkspaceActionError(null);
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
  }, [selectedLanguageId, dashboardReloadKey]);

  const selectedLanguage = data?.languages.find((language) => language.id === selectedLanguageId) ?? null;
  const isWorkflowBusy = review.isEvaluating
    || review.isDrafting
    || review.isModelDrafting
    || review.reviewingNoteId !== null
    || learner.isGrading
    || elder.isSubmittingCorrection
    || elder.reviewingCorrectionId !== null
    || elder.applyingCorrectionId !== null
    || governance.isSubmittingGovernance
    || governance.isSubmittingReviewPolicy
    || governance.resolvingReviewDispositionId !== null
    || governance.isExportingSnapshot
    || governance.isExportingEvaluationArtifact
    || model.isTestingModel
    || assistant.isSending;

  const overviewStats = useMemo(() => {
    if (!data) return [];
    return [
      { label: t("stats.notes"), value: data.notes.length.toString(), hint: t("stats.notesHint") },
      { label: t("stats.corpus"), value: data.corpus.length.toString(), hint: t("stats.corpusHint") },
      { label: t("stats.exercises"), value: data.exercises.length.toString(), hint: t("stats.exercisesHint") },
      { label: t("stats.evals"), value: data.evaluations.length.toString(), hint: t("stats.evalsHint") }
    ];
  }, [data, t]);

  const paletteCommands = useWorkspacePaletteCommands({
    workspace: data,
    t,
    onLanguageSelect: handleLanguageSelect,
    onViewSelect: handleViewSelect,
    setTheme
  });

  async function refreshDashboard() {
    const refreshed = await fetchDashboardData(selectedLanguageId ?? undefined);
    setLoadState({ status: "ready", data: refreshed });
  }

  function handleLanguageSelect(languageId: string) {
    setView("profile");
    setSelectedLanguageId(languageId);
  }

  async function handleCreateLanguage(payload: LanguageCreatePayload) {
    const created = await createLanguage(payload);
    setView("profile");
    setSelectedLanguageId(created.id);
  }

  async function handleDeleteLanguage(languageId: string) {
    await deleteLanguage(languageId);
    if (selectedLanguageId === languageId) {
      const snapshot = await fetchDashboardData();
      const nextId = snapshot.languages[0]?.id ?? null;
      setSelectedLanguageId(nextId);
      const refreshed = nextId ? await fetchDashboardData(nextId) : snapshot;
      setLoadState({ status: "ready", data: refreshed });
    } else {
      await refreshDashboard();
    }
  }

  function handleViewSelect(mode: ViewMode) {
    review.setWorkspaceActionError(null);
    setView(mode);
  }

  async function handleImportCorpusPassage(payload: CorpusImportPayload) {
    if (!selectedLanguageId) {
      throw new Error(t("errors.selectOrCreateLanguage"));
    }
    await importCorpusPassage(selectedLanguageId, payload);
    await refreshDashboard();
  }

  if (loadState.status === "loading") {
    return <StatusScreen kind="loading" message={t("app.loadingWorkspace")} />;
  }

  if (loadState.status === "error") {
    return (
      <StatusScreen
        kind="error"
        message={loadState.message}
        onRetry={() => setDashboardReloadKey((key) => key + 1)}
        retryLabel={t("app.retryLoad")}
      />
    );
  }

  if (!data) {
    return (
      <StatusScreen
        kind="error"
        message={t("app.workspaceUnavailable")}
        onRetry={() => setDashboardReloadKey((key) => key + 1)}
        retryLabel={t("app.retryLoad")}
      />
    );
  }

  const currentTitle = t(`viewConfig.${view}.title`);
  const currentEyebrow = t(`viewConfig.${view}.eyebrow`);
  const currentBreadcrumb = `${selectedLanguage?.name ?? t("common.language")} / ${t(`viewConfig.${view}.label`)}`;
  const sectionCounts: Partial<Record<ViewMode, number>> = {
    profile: data.corpus.length + data.notes.length + data.exercises.length,
    ingest: data.notes.length,
    learner: data.exercises.length,
    model: data.evaluations.length
  };

  return (
    <>
      {isPaletteOpen && (
        <CommandPalette commands={paletteCommands} onClose={() => setIsPaletteOpen(false)} />
      )}
      {showTour && <GuidedTour steps={TOUR_STEPS} onClose={dismissTour} />}
      <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("app.skipToMain")}
      </a>
      <aside className="sidebar" aria-label={t("sidebar.aria")}>
        <div className="brand-card">
          <div className="brand-mark">
            <CompassMark />
          </div>
          <div className="brand-copy">
            <p className="brand-kicker">AssiniLang</p>
            <strong>{t("sidebar.brandTitle")}</strong>
            <span>{t("sidebar.brandSubtitle")}</span>
          </div>
          <div className="brand-controls">
            <LanguageSwitcher />
            <button
              type="button"
              className="theme-toggle"
              aria-label={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? t("theme.light") : t("theme.dark")}
            </button>
          </div>
        </div>

        <DiamondBand />

        <div className="sidebar-section-label">{t("sidebar.languages")}</div>
        <SidebarLanguageNav
          languages={data.languages}
          selectedLanguageId={selectedLanguageId}
          view={view}
          isWorkflowBusy={isWorkflowBusy}
          sectionCounts={sectionCounts}
          onLanguageSelect={handleLanguageSelect}
          onViewSelect={handleViewSelect}
        />

        <div className="sidebar-footer">
          <CreateLanguageForm isWorkflowBusy={isWorkflowBusy} onCreate={handleCreateLanguage} />
          <DeleteLanguageForm
            languages={data.languages}
            selectedLanguageId={selectedLanguageId}
            isWorkflowBusy={isWorkflowBusy}
            onDelete={handleDeleteLanguage}
          />
          <button type="button" className="tour-trigger" onClick={() => setShowTour(true)}>
            {t("tour.takeTour")}
          </button>
          <div className="user-card">
            <span>{t("sidebar.signedIn")}</span>
            <strong>{currentUser?.name ?? t("sidebar.localUser")}</strong>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1} aria-busy={isWorkflowBusy}>
        <div className="prototype-notice">
          <strong>{t("app.localPrototype")}</strong>
          <span>{t("app.dataStaysLocal")}</span>
        </div>

        <WorkspaceHeader
          view={view}
          currentTitle={currentTitle}
          currentEyebrow={currentEyebrow}
          currentBreadcrumb={currentBreadcrumb}
          selectedLanguage={selectedLanguage}
          isWorkflowBusy={isWorkflowBusy}
          isDrafting={review.isDrafting}
          isModelDrafting={review.isModelDrafting}
          isEvaluating={review.isEvaluating}
          modelDraftMessage={review.modelDraftMessage}
          modelDraftError={review.modelDraftError}
          actionError={review.workspaceActionError}
          onGenerateDrafts={review.handleGenerateDrafts}
          onGenerateModelDrafts={review.handleGenerateModelDrafts}
          onRunEval={review.handleRunEval}
        />

        <DiamondBand compact />

        {view !== "elder" && (
          <section className="stat-strip" aria-label={t("header.statStripAria")}>
            {overviewStats.map((stat) => (
              <div key={stat.label} className="stat-card">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <em>{stat.hint}</em>
              </div>
            ))}
          </section>
        )}

        <section className="view-container simple-view-container" aria-labelledby="current-view-title">
          <h2 id="current-view-title" className="visually-hidden">
            {currentTitle}
          </h2>

          {(
            <>
              {view === "profile" && (
                selectedLanguageId ? (
                  <div className="simple-workspace-stack">
                    <section className="simple-intro" aria-label={t("simple.languageOverviewAria")}>
                      <div>
                        <span className="detail-label">{t("simple.startHere")}</span>
                        <h2>{selectedLanguage?.name ?? t("common.language")}</h2>
                        <p>{selectedLanguage?.description}</p>
                      </div>
                      <dl className="simple-summary-list">
                        <div>
                          <dt>{t("simple.examples")}</dt>
                          <dd>{data.corpus.length}</dd>
                        </div>
                        <div>
                          <dt>{t("simple.notes")}</dt>
                          <dd>{data.notes.length}</dd>
                        </div>
                        <div>
                          <dt>{t("simple.practice")}</dt>
                          <dd>{data.exercises.length}</dd>
                        </div>
                      </dl>
                    </section>
                    <section className="simple-section surface-section" aria-label={t("simple.savedExamplesAria")}>
                      <div className="simple-section-heading">
                        <span className="detail-label">{t("simple.savedExamples")}</span>
                        <h2>{t("simple.savedExamplesTitle")}</h2>
                        <p>{t("simple.savedExamplesBody")}</p>
                      </div>
                      <CorpusView
                        languageId={selectedLanguageId}
                        corpus={data.corpus}
                        isWorkflowBusy={isWorkflowBusy}
                        onImportCorpusPassage={handleImportCorpusPassage}
                      />
                    </section>
                  </div>
                ) : <NoLanguageNotice />
              )}
              {view === "ingest" && (
                selectedLanguageId ? (
                  <div className="simple-workspace-stack">
                    <section className="simple-section surface-section" aria-label={t("simple.addMaterialAria")}>
                      <div className="simple-section-heading">
                        <span className="detail-label">{t("simple.addMaterial")}</span>
                        <h2>{t("simple.addMaterialTitle")}</h2>
                        <p>{t("simple.addMaterialBody")}</p>
                      </div>
                      <IngestView languageId={selectedLanguageId} onIntakeCommitted={refreshDashboard} />
                    </section>
                    <section className="simple-section surface-section" aria-label={t("simple.reviewSuggestionsAria")}>
                      <div className="simple-section-heading">
                        <span className="detail-label">{t("simple.reviewSuggestions")}</span>
                        <h2>{t("simple.reviewSuggestionsTitle")}</h2>
                        <p>{t("simple.reviewSuggestionsBody")}</p>
                      </div>
                      <ReviewView
                        notes={data.notes}
                        selectedNote={review.selectedNote}
                        isWorkflowBusy={isWorkflowBusy}
                        reviewingNoteId={review.reviewingNoteId}
                        actionError={review.reviewActionError}
                        onSelectNote={(noteId) => {
                          review.setReviewActionError(null);
                          review.setSelectedNoteId(noteId);
                        }}
                        onReview={review.handleReview}
                        onSaveExplanation={review.handleSaveNoteExplanation}
                      />
                    </section>
                    <section className="simple-section surface-section" aria-label={t("simple.communityCorrectionsAria")}>
                      <div className="simple-section-heading">
                        <span className="detail-label">{t("simple.corrections")}</span>
                        <h2>{t("simple.correctionsTitle")}</h2>
                        <p>{t("simple.correctionsBody")}</p>
                      </div>
                      <ElderPage elder={elder} data={data} isWorkflowBusy={isWorkflowBusy} />
                    </section>
                  </div>
                ) : <NoLanguageNotice />
              )}
              {view === "learner" && (
                selectedLanguageId ? (
                  <div className="simple-workspace-stack">
                    <section className="simple-section surface-section" aria-label={t("simple.practiceExercisesAria")}>
                      <div className="simple-section-heading">
                        <span className="detail-label">{t("simple.practice")}</span>
                        <h2>{t("simple.practiceTitle")}</h2>
                        <p>{t("simple.practiceBody")}</p>
                      </div>
                      <LearnerView
                        languageId={selectedLanguageId}
                        exercises={data.exercises}
                        learner={learner}
                        isWorkflowBusy={isWorkflowBusy}
                      />
                    </section>
                    <section className="simple-section" aria-label={t("simple.askModelAria")}>
                      <div className="simple-section-heading">
                        <span className="detail-label">{t("simple.ask")}</span>
                        <h2>{t("simple.askTitle")}</h2>
                        <p>{t("simple.askBody")}</p>
                      </div>
                      <AssistantView
                        selectedLanguageId={selectedLanguageId}
                        contextNoteIds={data.notes.slice(0, 4).map((note) => note.id)}
                        contextPassageIds={data.corpus.slice(0, 4).map((passage) => passage.id)}
                        assistant={assistant}
                      />
                    </section>
                  </div>
                ) : <NoLanguageNotice />
              )}
              {view === "model" && (
                <div className="simple-workspace-stack">
                  <section className="simple-section surface-section" aria-label={t("simple.modelConnectionAria")}>
                    <div className="simple-section-heading">
                      <span className="detail-label">{t("simple.model")}</span>
                      <h2>{t("simple.modelTitle")}</h2>
                      <p>{t("simple.modelBody")}</p>
                    </div>
                    <ModelSetupView model={model} />
                  </section>
                  <section className="simple-section surface-section" aria-label={t("simple.qualityChecksAria")}>
                    <div className="simple-section-heading">
                      <span className="detail-label">{t("simple.checks")}</span>
                      <h2>{t("simple.checksTitle")}</h2>
                      <p>{t("simple.checksBody")}</p>
                    </div>
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
                  </section>
                  {selectedLanguageId ? (
                    <section className="simple-section surface-section" aria-label={t("simple.languageRulesAria")}>
                      <div className="simple-section-heading">
                        <span className="detail-label">{t("simple.rules")}</span>
                        <h2>{t("simple.rulesTitle")}</h2>
                        <p>{t("simple.rulesBody")}</p>
                      </div>
                      <GovernanceView
                        selectedLanguageId={selectedLanguageId}
                        governance={governance}
                      />
                    </section>
                  ) : <NoLanguageNotice />}
                </div>
              )}
            </>
          )}
        </section>
      </main>
      </div>
    </>
  );
}
