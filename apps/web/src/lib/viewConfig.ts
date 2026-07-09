import type { MessageKey } from "../i18n/en";
import type { Language, ReviewStatus, ViewMode } from "./types";

/** Sidebar primary navigation order (other views open from Start / deep links). */
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

/** i18n keys for persisted note-review comments (written into review history). */
export const REVIEWER_COMMENT_KEYS: Record<ReviewStatus, MessageKey> = {
  approved: "review.comment.approved",
  contested: "review.comment.contested",
  rejected: "review.comment.rejected",
  deferred: "review.comment.deferred",
  escalated: "review.comment.escalated"
};

export const REVIEWER_EDITED_EXPLANATION_COMMENT_KEY: MessageKey = "review.comment.editedExplanation";
export const REVIEWER_EDITED_EXAMPLES_COMMENT_KEY: MessageKey = "review.comment.editedExamples";
export const REVIEWER_EDITED_EXPLANATION_AND_EXAMPLES_COMMENT_KEY: MessageKey =
  "review.comment.editedExplanationAndExamples";
