import type { Note } from "@assini/db";
import type { DashboardData } from "../api";

export type ViewMode = "profile" | "ingest" | "corpus" | "review" | "learner" | "eval" | "governance" | "elder" | "assistant" | "model";
export type ReviewStatus = Extract<Note["status"], "approved" | "contested" | "rejected" | "deferred" | "escalated">;
export type ReviewFilter = "all" | "pending" | "contested" | "rejected" | "deferred" | "escalated" | "approved";
export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; statusCode?: number }
  | { status: "ready"; data: T };

export type DashboardLoadState = Exclude<AsyncState<DashboardData>, { status: "idle" }>;
export type Language = DashboardData["languages"][number];
export type CorpusPassage = DashboardData["corpus"][number];
export type PublicNote = DashboardData["notes"][number];
export type PublicExercise = DashboardData["exercises"][number];
export type Theme = "light" | "dark";
export type ThemeReader = Pick<Storage, "getItem">;
export type ThemeStorage = Pick<Storage, "getItem" | "setItem">;
export type SnapshotDownload = {
  fileName: string;
  href: string;
  summary: string;
  exportedAt: string;
};
