import { useEffect, useRef, useState } from "react";
import type { AssistantWorkspace } from "../hooks/useAssistantWorkspace";
import { formatStatus } from "../lib/format";
import { renderMarkdownLite } from "../lib/markdownLite";
import { useI18n } from "../i18n";
import { NoLanguageNotice } from "./NoLanguageNotice";

/**
 * First-class chat workspace over the existing AI session routes. Sessions use
 * the public "learner_practice" mode, so replies are grounded only in public
 * workspace context, and every assistant reply is labeled either as a model
 * reply or as the deterministic offline fallback.
 */
export function AssistantView({
  selectedLanguageId,
  contextNoteIds,
  contextPassageIds,
  assistant
}: {
  selectedLanguageId: string | null;
  contextNoteIds: string[];
  contextPassageIds: string[];
  assistant: AssistantWorkspace;
}) {
  const { t } = useI18n();
  const {
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
  } = assistant;

  const [setupInstructions, setSetupInstructions] = useState("");
  const session = sessionState.status === "ready" ? sessionState.data : null;
  const isStarting = sessionState.status === "loading";
  const endRef = useRef<HTMLDivElement | null>(null);
  const messageCount = session?.messages.length ?? 0;

  useEffect(() => {
    // jsdom does not implement scrollIntoView, hence the optional call.
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messageCount, isSending]);

  useEffect(() => {
    // Resume the last conversation for this language after a reload; the hook
    // attempts each language at most once and clears stale session ids itself.
    if (selectedLanguageId) void restoreSession(selectedLanguageId);
  }, [selectedLanguageId, restoreSession]);

  if (!selectedLanguageId) {
    return <NoLanguageNotice />;
  }

  function handleStart() {
    if (!selectedLanguageId) return;
    void createSession(selectedLanguageId, input, contextNoteIds, contextPassageIds, setupInstructions);
  }

  function handleSend() {
    void sendMessage(input);
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>, action: () => void) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      action();
    }
  }

  if (!session) {
    return (
      <section className="panel-card assistant-empty" aria-label={t("assistant.startConversationAriaLabel")}>
        <span className="detail-label">{t("assistant.groundedChat")}</span>
        <h2>{t("assistant.chatWithLocalModelHeading")}</h2>
        <p className="assistant-explainer">
          {t("assistant.explainer")}
        </p>
        <p className="muted assistant-empty-hint">{t("assistant.emptyStateHint")}</p>
        {sessionState.status === "error" && (
          <p className="result-notice error" role="alert" aria-live="assertive">
            {sessionState.message}
          </p>
        )}
        <label className="assistant-setup-label" htmlFor="assistant-setup">
          {t("assistant.conversationSetupLabel")}
        </label>
        <textarea
          id="assistant-setup"
          className="assistant-setup"
          aria-label={t("assistant.conversationSetupAriaLabel")}
          placeholder={t("assistant.conversationSetupPlaceholder")}
          value={setupInstructions}
          rows={2}
          disabled={isStarting}
          onChange={(event) => setSetupInstructions(event.target.value)}
        />
        <div className="assistant-composer">
          <textarea
            aria-label={t("assistant.seedPromptAriaLabel")}
            placeholder={t("assistant.seedPromptPlaceholder")}
            value={input}
            rows={3}
            disabled={isStarting}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => handleComposerKeyDown(event, handleStart)}
          />
          <button
            type="button"
            onClick={handleStart}
            disabled={isStarting || input.trim().length === 0}
            aria-busy={isStarting}
          >
            {isStarting ? t("assistant.starting") : t("assistant.startConversation")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-card assistant-chat" aria-label={t("assistant.conversationAriaLabel")}>
      <div className="record-topline">
        <div>
          <span className="detail-label">{t("assistant.groundedChat")}</span>
          <h2>{t("assistant.sessionHeading", { mode: formatStatus(session.mode, t) })}</h2>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => resetConversation(selectedLanguageId)}
          disabled={isSending}
        >
          {t("assistant.newConversation")}
        </button>
      </div>
      <div className="assistant-messages" role="log" aria-label={t("assistant.conversationMessagesAriaLabel")}>
        {session.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => (
            <div key={message.id} className={`assistant-message ${message.role}`}>
              <div className="assistant-message-meta">
                <span className="assistant-author">{message.role === "user" ? t("assistant.authorYou") : t("assistant.authorAssistant")}</span>
                {message.role === "assistant" && (
                  fallbackMessageIds.has(message.id) ? (
                    <span className="assistant-chip warning">{t("assistant.deterministicFallbackChip")}</span>
                  ) : (
                    <span className="assistant-chip">{t("assistant.modelReplyChip")}</span>
                  )
                )}
              </div>
              <div className="assistant-message-body">{renderMarkdownLite(message.content)}</div>
            </div>
          ))}
        {isSending && (
          <p className="assistant-thinking" role="status" aria-live="polite">
            {t("assistant.thinking")}
          </p>
        )}
        <div ref={endRef} />
      </div>
      {sendError && (
        <p className="result-notice error" role="alert" aria-live="assertive">
          {sendError}
        </p>
      )}
      <div className="assistant-composer">
        <textarea
          aria-label={t("assistant.messageAssistantAriaLabel")}
          placeholder={t("assistant.replyPlaceholder")}
          value={input}
          rows={2}
          disabled={isSending}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => handleComposerKeyDown(event, handleSend)}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isSending || input.trim().length === 0}
          aria-busy={isSending}
        >
          {isSending ? t("assistant.thinking") : t("assistant.send")}
        </button>
      </div>
      <p className="privacy-note">
        {t("assistant.privacyNote")}
      </p>
    </section>
  );
}
