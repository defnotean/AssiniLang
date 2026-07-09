import { useState } from "react";
import type { AiSession } from "@assini/db";
import { continueAiSession, createAiSession, fetchAiSession } from "../api";
import { useI18n, type Translate } from "../i18n";
import { localizeApiError } from "../lib/format";
import { getBrowserThemeStorage } from "../lib/theme";
import type { AsyncState } from "../lib/types";

export interface AssistantWorkspace {
  sessionState: AsyncState<AiSession>;
  input: string;
  setInput: (value: string) => void;
  isSending: boolean;
  sendError: string | null;
  fallbackMessageIds: ReadonlySet<string>;
  createSession: (
    languageId: string,
    seedPrompt: string,
    contextNoteIds: string[],
    contextPassageIds: string[],
    setupInstructions?: string
  ) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  restoreSession: (languageId: string) => Promise<void>;
  resetConversation: (languageId?: string | null) => void;
}

const SESSION_STORAGE_PREFIX = "assistant.session.";

function sessionStorageKey(languageId: string): string {
  return `${SESSION_STORAGE_PREFIX}${languageId}`;
}

function rememberSessionId(languageId: string, sessionId: string): void {
  try {
    getBrowserThemeStorage()?.setItem(sessionStorageKey(languageId), sessionId);
  } catch {
    // Ignore localStorage failures in test runners or locked-down browsers.
  }
}

function forgetSessionId(languageId: string): void {
  try {
    getBrowserThemeStorage()?.setItem(sessionStorageKey(languageId), "");
  } catch {
    // Ignore localStorage failures.
  }
}

function storedSessionId(languageId: string): string | null {
  try {
    const stored = getBrowserThemeStorage()?.getItem(sessionStorageKey(languageId));
    return stored && stored.trim().length > 0 ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Composes the seed prompt for a new conversation. Setup instructions ride in
 * the first user message; because every follow-up turn re-sends the full
 * conversation history to the model, the instructions keep applying for the
 * whole session - including after the user corrects the assistant.
 */
export function composeSeedPrompt(
  seedPrompt: string,
  setupInstructions?: string,
  t?: Translate
): string {
  const instructions = setupInstructions?.trim();
  if (!instructions) return seedPrompt.trim();
  const prefix = t
    ? t("assistant.conversationSetupSeedPrefix", { instructions })
    : `Conversation setup - follow these instructions for every reply in this session: ${instructions}`;
  return [prefix, seedPrompt.trim()].join("\n\n");
}

/**
 * Detects whether the most recent generation in the session trace was answered
 * by the deterministic offline fallback rather than a real model (same warning
 * convention as sessionUsedDeterministicFallback, scoped to the newest step so
 * each reply is labeled individually).
 */
function latestReplyUsedFallback(session: AiSession): boolean {
  const step = session.trace[session.trace.length - 1];
  return (step?.warnings ?? []).some((warning) => {
    const text = warning.toLowerCase();
    return text.includes("deterministic") || text.includes("offline fallback");
  });
}

function latestAssistantMessageId(session: AiSession): string | null {
  const assistant = session.messages.slice().reverse().find((message) => message.role === "assistant");
  return assistant?.id ?? null;
}

/**
 * Owns the AI Assistant chat workspace state: the active AI session, the
 * composer input, send/in-flight flags, and per-reply deterministic-fallback
 * detection. Sessions are created in the existing "learner_practice" mode via
 * the same prototype-actor convention as the model smoke test, and the active
 * session id is persisted per language so a reload resumes the conversation.
 */
export function useAssistantWorkspace(): AssistantWorkspace {
  const { t } = useI18n();
  const [sessionState, setSessionState] = useState<AsyncState<AiSession>>({ status: "idle" });
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [fallbackMessageIds, setFallbackMessageIds] = useState<ReadonlySet<string>>(new Set());
  const [restoreAttemptedFor, setRestoreAttemptedFor] = useState<string | null>(null);

  function recordFallback(session: AiSession) {
    if (!latestReplyUsedFallback(session)) return;
    const messageId = latestAssistantMessageId(session);
    if (!messageId) return;
    setFallbackMessageIds((current) => new Set(current).add(messageId));
  }

  async function createSession(
    languageId: string,
    seedPrompt: string,
    contextNoteIds: string[],
    contextPassageIds: string[],
    setupInstructions?: string
  ): Promise<void> {
    const prompt = composeSeedPrompt(seedPrompt, setupInstructions, t);
    if (!prompt) return;
    setSessionState({ status: "loading" });
    setSendError(null);
    setFallbackMessageIds(new Set());
    try {
      const session = await createAiSession({
        languageId,
        mode: "learner_practice",
        seedPrompt: prompt,
        contextNoteIds,
        contextPassageIds
      });
      recordFallback(session);
      setSessionState({ status: "ready", data: session });
      rememberSessionId(languageId, session.id);
      setInput("");
    } catch (error) {
      setSessionState({
        status: "error",
        message: localizeApiError(error, t, "assistant.errSessionCreateFailed")
      });
    }
  }

  async function sendMessage(text: string): Promise<void> {
    if (sessionState.status !== "ready" || isSending) return;
    const content = text.trim();
    if (!content) return;
    setIsSending(true);
    setSendError(null);
    try {
      const session = await continueAiSession(sessionState.data.id, content, sessionState.data.mode);
      recordFallback(session);
      setSessionState({ status: "ready", data: session });
      rememberSessionId(session.languageId, session.id);
      setInput("");
    } catch (error) {
      setSendError(localizeApiError(error, t, "assistant.errSessionMessageFailed"));
    } finally {
      setIsSending(false);
    }
  }

  async function restoreSession(languageId: string): Promise<void> {
    if (sessionState.status !== "idle" || restoreAttemptedFor === languageId) return;
    setRestoreAttemptedFor(languageId);
    const sessionId = storedSessionId(languageId);
    if (!sessionId) return;
    setSessionState({ status: "loading" });
    try {
      const session = await fetchAiSession(sessionId, "learner");
      if (session.languageId !== languageId) {
        forgetSessionId(languageId);
        setSessionState({ status: "idle" });
        return;
      }
      setSessionState({ status: "ready", data: session });
    } catch {
      // A stale or deleted session must never wedge the workspace.
      forgetSessionId(languageId);
      setSessionState({ status: "idle" });
    }
  }

  function resetConversation(languageId?: string | null) {
    if (languageId) forgetSessionId(languageId);
    setSessionState({ status: "idle" });
    setInput("");
    setIsSending(false);
    setSendError(null);
    setFallbackMessageIds(new Set());
    setRestoreAttemptedFor(null);
  }

  return {
    sessionState,
    input,
    setInput,
    isSending,
    sendError,
    fallbackMessageIds,
    createSession,
    sendMessage,
    restoreSession,
    resetConversation
  };
}
