import type { GovernanceRecord, ReviewDisposition } from "@assini/db";
import type { DraftGroundingFlag, ExtractionDraft, ExtractionDraftDuplicate } from "../api";
import type { MessageKey } from "../i18n/en";
import type { Language, PublicExercise, ReviewStatus, ViewMode } from "./types";

export const VIEW_CONFIG: Record<ViewMode, { label: string; title: string; eyebrow: string }> = {
  profile: { label: "Start", title: "Start", eyebrow: "Overview" },
  ingest: { label: "Build", title: "Build", eyebrow: "Add and review" },
  corpus: { label: "Examples", title: "Examples", eyebrow: "Saved material" },
  review: { label: "Review", title: "Review", eyebrow: "Check work" },
  learner: { label: "Practice", title: "Practice", eyebrow: "Exercises and chat" },
  eval: { label: "Checks", title: "Checks", eyebrow: "Quality" },
  governance: { label: "Rules", title: "Rules", eyebrow: "Safety and exports" },
  elder: { label: "Corrections", title: "Corrections", eyebrow: "Community fixes" },
  assistant: { label: "Chat", title: "Chat", eyebrow: "Ask the model" },
  model: { label: "Settings", title: "Settings", eyebrow: "Model and app setup" }
};

export const VIEW_ORDER: ViewMode[] = ["profile", "ingest", "learner", "model"];

export const LANGUAGE_TYPOLOGY_OPTIONS: Language["typology"][] = [
  "unknown",
  "agglutinative",
  "isolating",
  "fusional",
  "polysynthetic-lite",
  "polysynthetic",
  "analytic",
  "mixed"
];

export const EXTRACTION_DRAFT_KIND_LABELS: Record<ExtractionDraft["kind"], string> = {
  lexeme: "Lexeme",
  corpus_passage: "Corpus passage",
  grammar_note: "Grammar note"
};
export const EXTRACTION_DRAFT_DUPLICATE_LABELS: Record<ExtractionDraftDuplicate["kind"], string> = {
  exact: "Duplicate of existing entry",
  form: "Same form, different gloss",
  topic: "Duplicate topic",
  pending: "Duplicates another pending draft"
};
export const EXTRACTION_DRAFT_GROUNDING_LABELS: Record<DraftGroundingFlag["kind"], string> = {
  gloss_conflict: "Conflicts with accepted gloss",
  decomposable_form: "Form decomposes into accepted lexemes",
  segmentation_conflict: "Segment gloss conflicts with lexicon"
};
/** i18n keys for persisted note-review comments (written into review history). */
export const REVIEWER_COMMENT_KEYS: Record<ReviewStatus, MessageKey> = {
  approved: "review.comment.approved",
  contested: "review.comment.contested",
  rejected: "review.comment.rejected",
  deferred: "review.comment.deferred",
  escalated: "review.comment.escalated"
};

export const REVIEWER_EDITED_EXPLANATION_COMMENT_KEY: MessageKey = "review.comment.editedExplanation";

export const POLICY_TYPE_LABELS: Record<GovernanceRecord["policyType"], string> = {
  consent: "Consent",
  access: "Access",
  generation: "Generation"
};

export const REVIEW_DISPOSITION_LABELS: Record<ReviewDisposition["disposition"], string> = {
  contested: "Contested",
  rejected: "Rejected",
  deferred: "Deferred",
  escalated: "Escalated"
};

export const EXERCISE_TYPE_LABELS: Record<PublicExercise["type"], string> = {
  translate_to_target: "Translate to target",
  translate_to_english: "Translate to English",
  segment: "Segmentation",
  choose_particle: "Choose particle"
};
