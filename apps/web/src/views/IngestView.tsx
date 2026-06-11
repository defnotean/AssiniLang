import { useEffect, useState, type FormEvent } from "react";
import {
  acceptExtractionDraft,
  fetchExtractionDrafts,
  fetchSources,
  processSource,
  registerSource,
  rejectExtractionDraft,
  uploadSourceFile
} from "../api";
import type { ExtractionDraftView, SourceAsset, SourceRegistrationPayload } from "../api";
import { ConfidenceBadge, StatusBadge } from "../components/badges";
import { extractionDraftSummary, formatCount } from "../lib/format";
import { EXTRACTION_DRAFT_DUPLICATE_LABELS, EXTRACTION_DRAFT_KIND_LABELS } from "../lib/viewConfig";

export function IngestView({ languageId }: { languageId: string }) {
  const [sources, setSources] = useState<SourceAsset[]>([]);
  const [drafts, setDrafts] = useState<ExtractionDraftView[]>([]);
  const [isLoadingIntake, setIsLoadingIntake] = useState(true);
  const [intakeError, setIntakeError] = useState<string | null>(null);

  const [registerKind, setRegisterKind] = useState<SourceRegistrationPayload["kind"]>("text");
  const [registerTitle, setRegisterTitle] = useState("");
  const [registerText, setRegisterText] = useState("");
  const [registerUrl, setRegisterUrl] = useState("");
  const [registerNotice, setRegisterNotice] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegisteringSource, setIsRegisteringSource] = useState(false);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadingSource, setIsUploadingSource] = useState(false);

  const [processingSourceId, setProcessingSourceId] = useState<string | null>(null);
  const [pollingSource, setPollingSource] = useState<{ id: string; title: string } | null>(null);
  const [processNotice, setProcessNotice] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processWarnings, setProcessWarnings] = useState<string[]>([]);

  const [reviewingDraftId, setReviewingDraftId] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setIsLoadingIntake(true);
    setIntakeError(null);
    setRegisterNotice(null);
    setRegisterError(null);
    setProcessingSourceId(null);
    setPollingSource(null);
    setProcessNotice(null);
    setProcessError(null);
    setProcessWarnings([]);
    setDraftNotice(null);
    setDraftError(null);

    Promise.all([fetchSources(languageId), fetchExtractionDrafts(languageId, "proposed")])
      .then(([loadedSources, loadedDrafts]) => {
        if (!isCurrent) return;
        setSources(loadedSources);
        setDrafts(loadedDrafts);
      })
      .catch((error: Error) => {
        if (isCurrent) setIntakeError(error.message);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingIntake(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [languageId]);

  async function refreshIntake() {
    const [loadedSources, loadedDrafts] = await Promise.all([
      fetchSources(languageId),
      fetchExtractionDrafts(languageId, "proposed")
    ]);
    setSources(loadedSources);
    setDrafts(loadedDrafts);
  }

  async function handleRegisterSource(event: FormEvent) {
    event.preventDefault();
    const title = registerTitle.trim();
    const rawText = registerText.trim();
    const url = registerUrl.trim();

    if (!title) {
      setRegisterNotice(null);
      setRegisterError("Please provide a source title.");
      return;
    }

    if (registerKind === "url" ? !url : !rawText) {
      setRegisterNotice(null);
      setRegisterError(registerKind === "url" ? "Please provide the source URL." : "Please paste the source text.");
      return;
    }

    const payload: SourceRegistrationPayload = registerKind === "url"
      ? { kind: registerKind, title, url }
      : { kind: registerKind, title, rawText };

    setIsRegisteringSource(true);
    setRegisterNotice(null);
    setRegisterError(null);
    try {
      const registered = await registerSource(languageId, payload);
      setRegisterTitle("");
      setRegisterText("");
      setRegisterUrl("");
      setRegisterNotice(`Source registered: ${registered.title}.`);
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source registration failed";
      setRegisterError(message);
    } finally {
      setIsRegisteringSource(false);
    }
  }

  async function handleUploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!uploadFile) {
      setRegisterNotice(null);
      setRegisterError("Choose a file to upload.");
      return;
    }

    setIsUploadingSource(true);
    setRegisterNotice(null);
    setRegisterError(null);
    try {
      const uploaded = await uploadSourceFile(languageId, uploadFile, uploadTitle.trim() || undefined);
      setUploadFile(null);
      setUploadTitle("");
      form.reset();
      setRegisterNotice(`File uploaded as ${uploaded.kind} source: ${uploaded.title}.`);
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source upload failed";
      setRegisterError(message);
    } finally {
      setIsUploadingSource(false);
    }
  }

  // Poll the source list while a background extraction is running. The
  // first poll fires immediately, then every 2.5s until the asset leaves
  // "processing"; cleanup cancels the loop on unmount or language change.
  useEffect(() => {
    if (!pollingSource) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const loadedSources = await fetchSources(languageId);
        if (cancelled) return;
        setSources(loadedSources);

        const asset = loadedSources.find((item) => item.id === pollingSource.id);
        if (asset && asset.status === "processing") {
          timer = setTimeout(() => { void poll(); }, 2500);
          return;
        }

        setPollingSource(null);
        setProcessingSourceId(null);
        if (asset && asset.status === "failed") {
          setProcessError(asset.error ?? `Processing ${pollingSource.title} failed.`);
        } else {
          setProcessNotice(`Processing ${pollingSource.title} finished.`);
        }

        const loadedDrafts = await fetchExtractionDrafts(languageId, "proposed");
        if (!cancelled) setDrafts(loadedDrafts);
      } catch {
        // Transient fetch failure: keep polling instead of giving up.
        if (!cancelled) {
          timer = setTimeout(() => { void poll(); }, 2500);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [pollingSource, languageId]);

  async function handleProcessSource(sourceId: string) {
    setProcessingSourceId(sourceId);
    setProcessNotice(null);
    setProcessError(null);
    setProcessWarnings([]);
    try {
      const result = await processSource(sourceId, { async: true });
      setSources((previous) => previous.map((item) => (item.id === result.asset.id ? result.asset : item)));
      setPollingSource({ id: result.asset.id, title: result.asset.title });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source processing failed";
      setProcessError(message);
      setProcessingSourceId(null);
    }
  }

  async function handleDraftDecision(draftId: string, decision: "accept" | "reject") {
    setReviewingDraftId(draftId);
    setDraftNotice(null);
    setDraftError(null);
    try {
      if (decision === "accept") {
        const result = await acceptExtractionDraft(draftId);
        setDraftNotice(`Draft accepted: ${EXTRACTION_DRAFT_KIND_LABELS[result.draft.kind]} committed.`);
      } else {
        const rejected = await rejectExtractionDraft(draftId);
        setDraftNotice(`Draft rejected: ${EXTRACTION_DRAFT_KIND_LABELS[rejected.kind]}.`);
      }
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction draft review failed";
      setDraftError(message);
    } finally {
      setReviewingDraftId(null);
    }
  }

  if (isLoadingIntake) {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        Loading sources and intake queue...
      </div>
    );
  }

  if (intakeError) {
    return (
      <div className="panel-card error" role="alert">
        {intakeError}
      </div>
    );
  }

  return (
    <div className="ingest-view">
      <form className="record-card form-panel compact" aria-label="Register source" onSubmit={handleRegisterSource}>
        <div>
          <span className="detail-label">Source intake</span>
          <h3>Add source</h3>
        </div>
        {registerNotice && <p className="result-notice" role="status" aria-live="polite">{registerNotice}</p>}
        {registerError && <p className="result-notice error" role="alert">{registerError}</p>}
        <div className="form-group">
          <label htmlFor="ingest-source-kind">Source kind</label>
          <select
            id="ingest-source-kind"
            value={registerKind}
            onChange={(event) => setRegisterKind(event.target.value as SourceRegistrationPayload["kind"])}
          >
            <option value="text">Text</option>
            <option value="wordlist">Word list</option>
            <option value="url">URL</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="ingest-source-title">Source title</label>
          <input id="ingest-source-title" value={registerTitle} onChange={(event) => setRegisterTitle(event.target.value)} />
        </div>
        {registerKind === "url" ? (
          <div className="form-group">
            <label htmlFor="ingest-source-url">Source URL</label>
            <input
              id="ingest-source-url"
              type="url"
              value={registerUrl}
              onChange={(event) => setRegisterUrl(event.target.value)}
              placeholder="https://example.org/wordlist"
            />
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="ingest-source-text">Raw text</label>
            <textarea
              id="ingest-source-text"
              value={registerText}
              onChange={(event) => setRegisterText(event.target.value)}
              placeholder="Paste raw text or word list lines"
            />
          </div>
        )}
        <button type="submit" className="secondary" disabled={isRegisteringSource}>
          {isRegisteringSource ? "Registering..." : "Register source"}
        </button>
      </form>

      <form className="record-card form-panel compact" aria-label="Upload source file" onSubmit={handleUploadSource}>
        <div>
          <span className="detail-label">File intake</span>
          <h3>Upload image, audio, or document</h3>
        </div>
        <div className="form-group">
          <label htmlFor="ingest-upload-title">Upload title (optional)</label>
          <input id="ingest-upload-title" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="ingest-upload-file">Source file</label>
          <input
            id="ingest-upload-file"
            type="file"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <button type="submit" className="secondary" disabled={isUploadingSource || !uploadFile}>
          {isUploadingSource ? "Uploading..." : "Upload source file"}
        </button>
      </form>

      <section className="panel-card" aria-label="Registered sources">
        <div className="record-topline">
          <div>
            <span className="detail-label">Registered sources</span>
            <h2>{formatCount(sources.length, "source")}</h2>
          </div>
        </div>
        {processNotice && <p className="result-notice" role="status" aria-live="polite">{processNotice}</p>}
        {processError && <p className="result-notice error" role="alert">{processError}</p>}
        {processWarnings.length > 0 && (
          <div className="warning-list">
            {processWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        {sources.length === 0 ? (
          <p className="empty-state">No sources registered yet. Add raw text, a word list, a URL, or upload a file.</p>
        ) : (
          <div className="detail-list">
            {sources.map((source) => (
              <article className="detail-row source-row" key={source.id} aria-label={`Source ${source.title}`}>
                <div>
                  <strong>{source.title}</strong>
                  <div className="pill-row">
                    <span className="pill">{source.kind}</span>
                    <StatusBadge status={source.status} />
                    {source.kind === "audio" && (
                      <span className="pill">{source.transcript ? "transcript ready" : "no transcript yet"}</span>
                    )}
                  </div>
                  <small className="muted">Added by {source.createdBy} at {source.createdAt}</small>
                  {source.error && <p className="result-notice error">{source.error}</p>}
                  {source.warnings && source.warnings.length > 0 && (
                    <ul className="source-warnings" aria-label={`Processing warnings for ${source.title}`}>
                      {source.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={processingSourceId !== null}
                  onClick={() => handleProcessSource(source.id)}
                >
                  {processingSourceId === source.id ? "Processing..." : `Process ${source.title}`}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card" aria-label="Extraction draft queue">
        <div className="record-topline">
          <div>
            <span className="detail-label">Extraction drafts</span>
            <h2>{formatCount(drafts.length, "proposed draft")}</h2>
          </div>
        </div>
        {draftNotice && <p className="result-notice" role="status" aria-live="polite">{draftNotice}</p>}
        {draftError && <p className="result-notice error" role="alert">{draftError}</p>}
        {drafts.length === 0 ? (
          <p className="empty-state">No proposed extraction drafts. Process a source to propose lexemes, passages, and grammar notes.</p>
        ) : (
          <div className="detail-list">
            {drafts.map((draft) => (
              <article className="detail-row draft-row" key={draft.id} aria-label={`Extraction draft ${draft.id}`}>
                <div>
                  <div className="pill-row">
                    <span className="pill">{EXTRACTION_DRAFT_KIND_LABELS[draft.kind]}</span>
                    <ConfidenceBadge confidence={draft.confidence} />
                    {draft.duplicate && (
                      <span className={`status-badge ${draft.duplicate.kind === "pending" ? "under_review" : "contested"}`}>
                        {EXTRACTION_DRAFT_DUPLICATE_LABELS[draft.duplicate.kind]}
                      </span>
                    )}
                  </div>
                  <strong>{extractionDraftSummary(draft)}</strong>
                  {draft.rationale && <p>{draft.rationale}</p>}
                </div>
                <div className="correction-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={reviewingDraftId !== null}
                    onClick={() => handleDraftDecision(draft.id, "accept")}
                  >
                    {reviewingDraftId === draft.id ? "Reviewing..." : `Accept draft ${draft.id}`}
                  </button>
                  <button
                    type="button"
                    className="contest"
                    disabled={reviewingDraftId !== null}
                    onClick={() => handleDraftDecision(draft.id, "reject")}
                  >
                    Reject draft {draft.id}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
