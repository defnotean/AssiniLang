import type { GovernanceRecord, ReviewDisposition } from "@assini/db";
import type { ExtractionDraft, ExtractionDraftDuplicate } from "../api";
import type { Language, PublicExercise, ReviewStatus, ViewMode } from "./types";

export const VIEW_CONFIG: Record<ViewMode, { label: string; title: string; eyebrow: string }> = {
  profile: { label: "Language Profile", title: "Language Profile", eyebrow: "Linguistic profile" },
  ingest: { label: "Sources & intake", title: "Sources & Intake", eyebrow: "Source ingestion" },
  corpus: { label: "Corpus Browser", title: "Corpus Browser", eyebrow: "Source library" },
  review: { label: "Note Review Queue", title: "Note Review Queue", eyebrow: "Human review" },
  learner: { label: "Learning Lab", title: "Learner Exercise Preview", eyebrow: "Practice" },
  eval: { label: "Evaluation Dashboard", title: "Evaluation Dashboard", eyebrow: "Quality gates" },
  governance: { label: "Governance", title: "Governance & Policy", eyebrow: "Policy" },
  model: { label: "Model Setup", title: "Model Setup", eyebrow: "Local LLM readiness" }
};

export const VIEW_ORDER: ViewMode[] = ["profile", "ingest", "corpus", "review", "learner", "eval", "governance", "model"];

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
export const REVIEWER_COMMENTS: Record<ReviewStatus, string> = {
  approved: "Approved in local prototype.",
  contested: "Contested in local prototype.",
  rejected: "Rejected in local prototype.",
  deferred: "Deferred in local prototype.",
  escalated: "Escalated in local prototype."
};

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
