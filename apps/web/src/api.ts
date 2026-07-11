export { ApiError, closePrototypeSession } from "./lib/apiClient";
export type { DesktopBackupSummary, DesktopPreferences, DesktopShortcutSummary } from "./lib/apiClient";

export {
  continueAiSession,
  createAiSession,
  fetchAiSession,
  fetchNeuralMap,
  fetchObservability
} from "./api/aiSessionApi";
export type { CreateAiSessionPayload, NeuralMapResponse, ObservabilityData } from "./api/aiSessionApi";

export { applyElderCorrection, fetchElderContext, reviewElderCorrection, submitElderCorrection } from "./api/elderApi";
export type { ElderContext, ElderCorrectionApplyResult, ElderCorrectionReviewStatus } from "./api/elderApi";

export {
  createExercise,
  fetchExerciseSubmissions,
  fetchRecommendedExercises,
  generateModelExercise,
  submitExerciseAnswer,
  validateExerciseAuthoring
} from "./api/exerciseApi";
export type {
  ExerciseAuthoringDryRunResult,
  ExerciseAuthoringPayload,
  GeneratedExerciseDraft,
  PracticeRecommendationRationale,
  PracticeRecommendationStatus,
  PublicExercise,
  PublicExerciseSubmission,
  RecommendedExercises
} from "./api/exerciseApi";

export {
  createGovernanceRecord,
  fetchAuditEvents,
  fetchGovernance,
  fetchReviewDispositions,
  fetchReviewPolicy,
  resolveReviewDisposition,
  updateReviewPolicy
} from "./api/governanceApi";
export type { GovernancePayload, ReviewPolicyPayload } from "./api/governanceApi";

export {
  acceptExtractionDraft,
  bulkReviewExtractionDrafts,
  cancelSourceProcessing,
  fetchExtractionDrafts,
  fetchSources,
  importObsidianVault,
  processSource,
  registerSource,
  rejectExtractionDraft,
  uploadSourceFile
} from "./api/ingestApi";
export type {
  AcceptExtractionDraftOptions,
  AcceptExtractionDraftResult,
  BulkReviewAction,
  BulkReviewExtractionDraftsResult,
  BulkReviewItemResult,
  DraftGroundingFlag,
  ExtractionDraftDuplicate,
  ExtractionDraftView,
  ProcessingQueuePhase,
  ProcessSourceResult,
  SourceAssetView
} from "./api/ingestApi";

export {
  createLanguage,
  deleteLanguage,
  fetchDashboardData,
  fetchEvaluationArtifact,
  fetchLanguageProfile,
  fetchLanguageSnapshot,
  fetchLexicon,
  runEvaluation,
  updateLanguage
} from "./api/languageApi";
export type {
  DashboardData,
  EvaluationArtifact,
  ExportIntegrity,
  LanguageDeleteResult,
  LanguageProfile,
  LanguageProfileStats,
  LanguageSnapshot,
  MorphemeInventoryItem,
  ParadigmGap,
  PublicGrammarRule,
  PublicVocabularyItem
} from "./api/languageApi";

export {
  activateModelProfile,
  checkLlmReachability,
  deleteModelProfile,
  fetchDiscoveredModels,
  fetchLlmStatus,
  fetchRuntimeSettings,
  saveModelProfile,
  updateRuntimeSettings
} from "./api/llmApi";
export type { RuntimeSettingsUpdate } from "./api/llmApi";
export type { ProcessSourceResponse, RuntimeSettingsPatch } from "@assini/api-contract";

export {
  fetchObsidianMcpResources,
  fetchObsidianMcpSettings,
  importObsidianMcpResources,
  testObsidianMcpConnection,
  updateObsidianMcpSettings
} from "./api/mcpApi";
export type {
  ObsidianMcpConnectionStatus,
  ObsidianMcpImportResponse,
  ObsidianMcpResourceList,
  ObsidianMcpSettings,
  ObsidianMcpSettingsPatch
} from "./api/mcpApi";

export {
  generateDraftNotes,
  generateModelDraftNotes,
  importCorpusBulk,
  importCorpusPassage,
  reviewNote,
  validateCorpusBulk,
  validateCorpusImport
} from "./api/studyApi";
export type {
  CorpusBulkImportResponse,
  CorpusBulkImportRowResult,
  CorpusImportDryRunResult,
  CorpusImportPayload,
  ModelDraftGrounding,
  ModelDraftGroundingCheck,
  ModelDraftNote,
  ReviewNotePayload
} from "./api/studyApi";

export { fetchCurrentUser } from "./api/userApi";

export type {
  DiscoveredLlmModel,
  ElderCorrectionPayload,
  LanguageCreatePayload,
  LanguagePatchPayload,
  LlmModelDiscoveryResponse,
  LlmReachability,
  LlmStatus,
  LlmModelProfile,
  ModelProfileSavePayload,
  ObsidianVaultImportPayload,
  ObsidianVaultImportResponse,
  RuntimeSettings,
  RuntimeSettingsResponse,
  SourceRegistrationPayload
} from "@assini/api-contract";

export type { ExtractionDraft, Language, LanguagePhonology, Lexeme, SourceAsset } from "@assini/api-contract";
