export { ApiError, closePrototypeSession } from "./lib/apiClient";
export type { DesktopBackupSummary, DesktopPreferences, DesktopShortcutSummary } from "./lib/apiClient";

export {
  continueAiSession,
  createAiSession,
  fetchAiSession,
  fetchNeuralMap,
  fetchObservability
} from "./api/aiSessionApi";
export type {
  CreateAiSessionPayload,
  NeuralMapResponse,
  ObservabilityData
} from "./api/aiSessionApi";

export {
  applyElderCorrection,
  fetchElderContext,
  reviewElderCorrection,
  submitElderCorrection
} from "./api/elderApi";
export type {
  ElderContext,
  ElderCorrectionApplyResult,
  ElderCorrectionReviewStatus
} from "./api/elderApi";

export {
  createExercise,
  fetchExerciseSubmissions,
  fetchRecommendedExercises,
  generateModelExercise,
  submitExerciseAnswer
} from "./api/exerciseApi";
export type {
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
  fetchExtractionDrafts,
  fetchSources,
  processSource,
  registerSource,
  rejectExtractionDraft,
  uploadSourceFile
} from "./api/ingestApi";
export type {
  AcceptExtractionDraftResult,
  BulkReviewAction,
  BulkReviewExtractionDraftsResult,
  BulkReviewItemResult,
  DraftGroundingFlag,
  ExtractionDraftDuplicate,
  ExtractionDraftView,
  ProcessSourceResult
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
  checkLlmReachability,
  fetchDiscoveredModels,
  fetchLlmStatus,
  fetchRuntimeSettings,
  updateRuntimeSettings
} from "./api/llmApi";
export type { RuntimeSettingsUpdate } from "./api/llmApi";

export {
  generateDraftNotes,
  generateModelDraftNotes,
  importCorpusPassage,
  reviewNote
} from "./api/studyApi";
export type {
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
  RuntimeSettings,
  RuntimeSettingsResponse,
  SourceRegistrationPayload
} from "@assini/api-contract";

export type { ExtractionDraft, Language, LanguagePhonology, Lexeme, SourceAsset } from "@assini/db";
