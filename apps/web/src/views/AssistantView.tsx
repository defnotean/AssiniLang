import { useEffect, useRef } from "react";
import type { AssistantWorkspace } from "../hooks/useAssistantWorkspace";
import { formatStatus } from "../lib/format";
import { renderMarkdownLite } from "../lib/markdownLite";
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
  const {
    sessionState,
    input,
    setInput,
    isSending,
    sendError,
    fallbackMessageIds,
    createSession,
    sendMessage,
    resetConversation
  } = assistant;

  const session = sessionState.status === "ready" ? sessionState.data : null;
  const isStarting = sessionState.status === "loading";
  const endRef = useRef<HTMLDivElement | null>(null);
  const messageCount = session?.messages.length ?? 0;

  useEffect(() => {
    // jsdom does not implement scrollIntoView, hence the optional call.
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messageCount, isSending]);

  if (!selectedLanguageId) {
    return <NoLanguageNotice />;
  }

  function handleStart() {
    if (!selectedLanguageId) return;
    void createSession(selectedLanguageId, input, contextNoteIds, contextPassageIds);
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
      <section className="panel-card assistant-empty" aria-label="Start an assistant conversation">
        <span className="detail-label">Grounded chat</span>
        <h2>Chat with the local model</h2>
        <p className="assistant-explainer">
          Chat with the configured local model using only public workspace context. The selected language&apos;s public
          notes and corpus passages are attached as observable evidence, hidden chain-of-thought is never exposed, and
          replies are clearly labeled when the deterministic offline fallback answered instead of a real model.
        </p>
        {sessionState.status === "error" && (
          <p className="result-notice error" role="alert">
            {sessionState.message}
          </p>
        )}
        <div className="assistant-composer">
          <textarea
            aria-label="Seed prompt"
            placeholder="Ask about the selected language, e.g. How do verb chains work?"
            value={input}
            rows={3}
            disabled={isStarting}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => handleComposerKeyDown(event, handleStart)}
          />
          <button type="button" onClick={handleStart} disabled={isStarting || input.trim().length === 0}>
            {isStarting ? "Starting..." : "Start conversation"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-card assistant-chat" aria-label="Assistant conversation">
      <div className="record-topline">
        <div>
          <span className="detail-label">Grounded chat</span>
          <h2>{formatStatus(session.mode)} session</h2>
        </div>
        <button type="button" className="secondary" onClick={resetConversation} disabled={isSending}>
          New conversation
        </button>
      </div>
      <div className="assistant-messages" role="log" aria-label="Conversation messages">
        {session.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => (
            <div key={message.id} className={`assistant-message ${message.role}`}>
              <div className="assistant-message-meta">
                <span className="assistant-author">{message.role === "user" ? "You" : "Assistant"}</span>
                {message.role === "assistant" && (
                  fallbackMessageIds.has(message.id) ? (
                    <span className="assistant-chip warning">deterministic fallback (no model)</span>
                  ) : (
                    <span className="assistant-chip">model reply</span>
                  )
                )}
              </div>
              <div className="assistant-message-body">{renderMarkdownLite(message.content)}</div>
            </div>
          ))}
        {isSending && (
          <p className="assistant-thinking" role="status" aria-live="polite">
            Thinking...
          </p>
        )}
        <div ref={endRef} />
      </div>
      {sendError && (
        <p className="result-notice error" role="alert">
          {sendError}
        </p>
      )}
      <div className="assistant-composer">
        <textarea
          aria-label="Message the assistant"
          placeholder="Reply (Enter to send, Shift+Enter for a new line)"
          value={input}
          rows={2}
          disabled={isSending}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => handleComposerKeyDown(event, handleSend)}
        />
        <button type="button" onClick={handleSend} disabled={isSending || input.trim().length === 0}>
          {isSending ? "Thinking..." : "Send"}
        </button>
      </div>
      <p className="privacy-note">
        Grounded in public workspace context only. Hidden chain-of-thought is never exposed, and fallback replies are
        flagged so canned offline text is never mistaken for a model answer.
      </p>
    </section>
  );
}
