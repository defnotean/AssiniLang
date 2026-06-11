import { useState } from "react";
import type { AiSession } from "@assini/db";
import { continueAiSession, createAiSession } from "../api";
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
    contextPassageIds: string[]
  ) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  resetConversation: () => void;
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
 * the same prototype-actor convention as the model smoke test.
 */
export function useAssistantWorkspace(): AssistantWorkspace {
  const [sessionState, setSessionState] = useState<AsyncState<AiSession>>({ status: "idle" });
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [fallbackMessageIds, setFallbackMessageIds] = useState<ReadonlySet<string>>(new Set());

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
    contextPassageIds: string[]
  ): Promise<void> {
    const prompt = seedPrompt.trim();
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
      setInput("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI session creation failed";
      setSessionState({ status: "error", message });
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
      setInput("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI session message failed";
      setSendError(message);
    } finally {
      setIsSending(false);
    }
  }

  function resetConversation() {
    setSessionState({ status: "idle" });
    setInput("");
    setIsSending(false);
    setSendError(null);
    setFallbackMessageIds(new Set());
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
    resetConversation
  };
}
