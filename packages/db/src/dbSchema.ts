import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const languages = sqliteTable("languages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  orthography: text("orthography").notNull(),
  typology: text("typology").notNull(),
  status: text("status").notNull(),
  phonology: text("phonology", { mode: "json" }),
  createdBy: text("created_by"),
  createdAt: text("created_at")
});

export const corpus = sqliteTable("corpus", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  source: text("source").notNull(),
  sourceMetadata: text("source_metadata", { mode: "json" }).notNull(),
  textTarget: text("text_target").notNull(),
  textTranslation: text("text_translation").notNull(),
  morphologicalSegmentation: text("morphological_segmentation", { mode: "json" }).notNull(),
  topicTags: text("topic_tags", { mode: "json" }).notNull(),
  consentStatus: text("consent_status", { mode: "json" }).notNull(),
  sourceAssetId: text("source_asset_id")
});

export const corpusAnswerKeys = sqliteTable("corpus_answer_keys", {
  passageId: text("passage_id").primaryKey(),
  languageId: text("language_id").notNull(),
  textTarget: text("text_target").notNull(),
  textTranslation: text("text_translation").notNull(),
  morphologicalSegmentation: text("morphological_segmentation", { mode: "json" }).notNull()
});

export const noteAnswerKeys = sqliteTable("note_answer_keys", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  topic: text("topic").notNull(),
  explanation: text("explanation").notNull(),
  examples: text("examples", { mode: "json" }).notNull(),
  evidencePassageIds: text("evidence_passage_ids", { mode: "json" }).notNull(),
  evidenceCount: integer("evidence_count").notNull(),
  confidence: text("confidence").notNull(),
  status: text("status").notNull(),
  reviewer: text("reviewer", { mode: "json" }).notNull(),
  dialectScope: text("dialect_scope").notNull(),
  editHistory: text("edit_history", { mode: "json" }).notNull()
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  topic: text("topic").notNull(),
  explanation: text("explanation").notNull(),
  examples: text("examples", { mode: "json" }).notNull(),
  evidencePassageIds: text("evidence_passage_ids", { mode: "json" }).notNull(),
  evidenceCount: integer("evidence_count").notNull(),
  confidence: text("confidence").notNull(),
  status: text("status").notNull(),
  reviewer: text("reviewer", { mode: "json" }).notNull(),
  dialectScope: text("dialect_scope").notNull(),
  editHistory: text("edit_history", { mode: "json" }).notNull()
});

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  type: text("type").notNull(),
  prompt: text("prompt").notNull(),
  allowedVocabulary: text("allowed_vocabulary", { mode: "json" }).notNull(),
  allowedRuleIds: text("allowed_rule_ids", { mode: "json" }).notNull(),
  expectedAnswers: text("expected_answers", { mode: "json" }).notNull(),
  adversarialAnswers: text("adversarial_answers", { mode: "json" }).notNull(),
  gradingExplanation: text("grading_explanation").notNull()
});

export const exerciseSubmissions = sqliteTable("exercise_submissions", {
  id: text("id").primaryKey(),
  exerciseId: text("exercise_id").notNull(),
  languageId: text("language_id").notNull(),
  answer: text("answer").notNull(),
  accepted: integer("accepted", { mode: "boolean" }).notNull(),
  explanation: text("explanation").notNull(),
  submittedAt: text("submitted_at").notNull(),
  learnerId: text("learner_id").notNull()
});

export const evaluationRuns = sqliteTable("evaluation_runs", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  systemVersion: text("system_version").notNull(),
  fixtureVersion: text("fixture_version").notNull(),
  scores: text("scores", { mode: "json" }).notNull(),
  failures: text("failures", { mode: "json" }).notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull()
});

export const governance = sqliteTable("governance", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  policyType: text("policy_type").notNull(),
  content: text("content").notNull(),
  effectiveDate: text("effective_date").notNull(),
  approvedBy: text("approved_by").notNull()
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url")
});

export const aiSessions = sqliteTable("ai_sessions", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  contextNoteIds: text("context_note_ids", { mode: "json" }).notNull(),
  contextPassageIds: text("context_passage_ids", { mode: "json" }).notNull(),
  messages: text("messages", { mode: "json" }).notNull(),
  thinkingSummary: text("thinking_summary").notNull(),
  trace: text("trace", { mode: "json" }).notNull(),
  neuralMap: text("neural_map", { mode: "json" }).notNull(),
  privacy: text("privacy", { mode: "json" }).notNull()
});

export const elderCorrections = sqliteTable("elder_corrections", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  noteId: text("note_id"),
  passageId: text("passage_id"),
  correction: text("correction").notNull(),
  rationale: text("rationale").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  contextText: text("context_text"),
  proposedBy: text("proposed_by").notNull(),
  proposedAt: text("proposed_at").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at")
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  languageId: text("language_id"),
  actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  summary: text("summary").notNull(),
  metadata: text("metadata", { mode: "json" }).notNull(),
  at: text("at").notNull()
});

export const reviewPolicies = sqliteTable("review_policies", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  assignedReviewerIds: text("assigned_reviewer_ids", { mode: "json" }).notNull(),
  approvalThreshold: integer("approval_threshold").notNull(),
  requiresAssignedReviewer: integer("requires_assigned_reviewer", { mode: "boolean" }).notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull()
});

export const reviewApprovals = sqliteTable("review_approvals", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  noteId: text("note_id").notNull(),
  reviewerId: text("reviewer_id").notNull(),
  approvedAt: text("approved_at").notNull()
});

export const reviewDispositions = sqliteTable("review_dispositions", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  noteId: text("note_id").notNull(),
  disposition: text("disposition").notNull(),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  assignedTo: text("assigned_to").notNull(),
  dueAt: text("due_at"),
  openedAt: text("opened_at").notNull(),
  openedBy: text("opened_by").notNull(),
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"),
  resolutionSummary: text("resolution_summary")
});

export const lexemes = sqliteTable("lexemes", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  form: text("form").notNull(),
  gloss: text("gloss").notNull(),
  partOfSpeech: text("part_of_speech").notNull(),
  tags: text("tags", { mode: "json" }).notNull(),
  notes: text("notes"),
  sourceAssetIds: text("source_asset_ids", { mode: "json" }).notNull(),
  createdBy: text("created_by"),
  createdAt: text("created_at")
});

export const sourceAssets = sqliteTable("source_assets", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  originalName: text("original_name"),
  mimeType: text("mime_type"),
  filePath: text("file_path"),
  url: text("url"),
  rawText: text("raw_text"),
  transcript: text("transcript"),
  status: text("status").notNull(),
  error: text("error"),
  summary: text("summary"),
  warnings: text("warnings", { mode: "json" }),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  processedAt: text("processed_at")
});

export const extractionDrafts = sqliteTable("extraction_drafts", {
  id: text("id").primaryKey(),
  languageId: text("language_id").notNull(),
  sourceAssetId: text("source_asset_id").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  confidence: text("confidence").notNull(),
  rationale: text("rationale"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  committedEntityId: text("committed_entity_id")
});
