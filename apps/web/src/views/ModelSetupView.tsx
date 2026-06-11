import type { LlmReachability, LlmStatus, ObservabilityData } from "../api";
import { StatusBadge } from "../components/badges";
import { countFailedSessions, formatCount, formatMode, formatReachability, formatStatus } from "../lib/format";
import type { AsyncState } from "../lib/types";

export function ModelSetupView({
  llmState,
  observabilityState,
  isTestingModel,
  modelTestResult,
  modelTestIsPlaceholder,
  onSmokeTest,
  isCheckingReachability,
  reachabilityResult,
  reachabilityError,
  onTestConnection
}: {
  llmState: AsyncState<LlmStatus>;
  observabilityState: AsyncState<ObservabilityData>;
  isTestingModel: boolean;
  modelTestResult: string | null;
  modelTestIsPlaceholder: boolean;
  onSmokeTest: () => void;
  isCheckingReachability: boolean;
  reachabilityResult: LlmReachability | null;
  reachabilityError: string | null;
  onTestConnection: () => void;
}) {
  if (llmState.status === "loading" || llmState.status === "idle") {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        Checking model provider configuration...
      </div>
    );
  }

  if (llmState.status === "error") {
    return (
      <div className="panel-card error" role="alert">
        {llmState.message}
      </div>
    );
  }

  const status = llmState.data;
  const observability = observabilityState.status === "ready" ? observabilityState.data : null;
  const recentSessions = observability?.sessions.slice(0, 5) ?? [];
  return (
    <div className="model-grid">
      <section className="panel-card model-status" aria-label="LLM provider readiness">
        <div className="record-topline">
          <div>
            <span className="detail-label">Provider readiness</span>
            <h2>{status.configured ? "Ready" : "Needs configuration"}</h2>
          </div>
          <span className={`status-badge ${status.configured ? "approved" : "under_review"}`}>
            {status.configured ? "Configured" : "Incomplete"}
          </span>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Mode</dt>
            <dd>{formatMode(status.mode)}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{status.provider}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{status.model ?? "Not set"}</dd>
          </div>
          <div>
            <dt>Base URL</dt>
            <dd>{status.baseUrl ?? "Not set"}</dd>
          </div>
          <div>
            <dt>API key</dt>
            <dd>{status.apiKey.configured ? "Configured server-side" : status.apiKey.required ? "Required" : "Optional / not set"}</dd>
          </div>
          <div>
            <dt>Timeout</dt>
            <dd>{status.timeoutMs}ms</dd>
          </div>
        </dl>
        <p className="privacy-note">
          API keys are never entered in the browser or returned by the status endpoint. Configure keys only in the API server
          environment.
        </p>
        {status.warnings.length > 0 && (
          <div className="warning-list">
            {status.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        <div className="model-actions">
          <button type="button" onClick={onSmokeTest} disabled={isTestingModel}>
            {isTestingModel ? "Testing provider..." : "Run provider smoke test"}
          </button>
          <button type="button" className="secondary" onClick={onTestConnection} disabled={isCheckingReachability}>
            {isCheckingReachability ? "Testing…" : "Test connection"}
          </button>
        </div>
        {modelTestResult && (
          <>
            {modelTestIsPlaceholder && (
              <p className="result-notice warning" role="status" aria-live="polite">
                Offline placeholder — no model is configured, so this is a canned response, not a real model reply.
                Configure a provider in the variables below and restart the API.
              </p>
            )}
            <p className="result-notice" role="status" aria-live="polite">
              {modelTestResult}
            </p>
          </>
        )}
        {reachabilityError && (
          <p className="result-notice error" role="alert">
            {reachabilityError}
          </p>
        )}
        {reachabilityResult && (
          <p className="result-notice" role="status" aria-live="polite">
            {formatReachability(reachabilityResult)}
          </p>
        )}
      </section>

      <section className="panel-card model-observability" aria-label="Model session observability">
        <div className="record-topline">
          <div>
            <span className="detail-label">Session observability</span>
            <h2>{observability ? `${observability.totals.sessions} sessions` : "Loading sessions"}</h2>
          </div>
          {observability && (
            <span className={`status-badge ${countFailedSessions(observability) > 0 ? "contested" : "approved"}`}>
              {countFailedSessions(observability)} failed
            </span>
          )}
        </div>
        {observabilityState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">Loading AI session observability...</p>
        )}
        {observabilityState.status === "error" && (
          <p className="inline-error" role="alert">{observabilityState.message}</p>
        )}
        {observability && (
          <>
            <dl className="detail-grid">
              <div>
                <dt>Active</dt>
                <dd>{observability.totals.activeSessions}</dd>
              </div>
              <div>
                <dt>Failed</dt>
                <dd>{countFailedSessions(observability)}</dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{observability.totals.messages}</dd>
              </div>
              <div>
                <dt>Elder corrections</dt>
                <dd>{observability.totals.elderCorrections}</dd>
              </div>
            </dl>
            {recentSessions.length === 0 ? (
              <p className="inline-empty">No AI sessions recorded.</p>
            ) : (
              <div className="detail-list session-list">
                {recentSessions.map((session) => (
                  <div key={session.id} className="detail-row session-row">
                    <StatusBadge status={session.status} />
                    <strong>{formatStatus(session.mode)}</strong>
                    <span>{session.languageId}</span>
                    <span>{formatCount(session.messageCount, "message")}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel-card setup-card" aria-label="Local LLM setup instructions">
        <span className="detail-label">Local OpenAI-compatible endpoints</span>
        <h2>Ollama, LM Studio, or llama.cpp</h2>
        <p>Start a local server that exposes <code>/v1/chat/completions</code>, then set the API process environment:</p>
        <div className="command-list">
          {status.setup.localExamples.map((example) => (
            <code key={example}>{example}</code>
          ))}
        </div>
      </section>

      <section className="panel-card setup-card" aria-label="Remote API setup instructions">
        <span className="detail-label">Remote API key integration</span>
        <h2>Server-side keys only</h2>
        <p>For hosted OpenAI-compatible APIs, keep the key in the API process and let the backend proxy safe requests.</p>
        <div className="command-list">
          {status.setup.remoteExamples.map((example) => (
            <code key={example}>{example}</code>
          ))}
        </div>
      </section>
    </div>
  );
}
