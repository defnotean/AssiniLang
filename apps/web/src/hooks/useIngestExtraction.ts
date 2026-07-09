import { useEffect, useState, type FormEvent } from "react";
import {
  acceptExtractionDraft,
  bulkReviewExtractionDrafts,
  fetchExtractionDrafts,
  fetchSources,
  importObsidianVault,
  processSource,
  registerSource,
  rejectExtractionDraft,
  uploadSourceFile
} from "../api";
import type { BulkReviewAction, ExtractionDraftView, SourceAsset, SourceRegistrationPayload } from "../api";
import {
  localizeApiError,
  localizeExtractionDraftFailure,
  localizeSourceProcessingError,
  localizeVaultImportError
} from "../lib/format";
import type { Translate } from "../i18n";

export const INGEST_POLL_INTERVAL_MS = 2500;
export const INGEST_POLL_MAX_DURATION_MS = 10 * 60 * 1000;

export function useIngestExtraction(
  languageId: string,
  t: Translate,
  onIntakeCommitted?: () => Promise<void> | void
) {
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
  const [vaultPath, setVaultPath] = useState("");
  const [vaultIncludeSubfolders, setVaultIncludeSubfolders] = useState(true);
  const [vaultMaxFiles, setVaultMaxFiles] = useState("100");
  const [isImportingVault, setIsImportingVault] = useState(false);
  const [vaultNotice, setVaultNotice] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const [processingSourceId, setProcessingSourceId] = useState<string | null>(null);
  const [pollingSource, setPollingSource] = useState<{ id: string; title: string } | null>(null);
  const [processNotice, setProcessNotice] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processWarnings, setProcessWarnings] = useState<string[]>([]);

  const [reviewingDraftId, setReviewingDraftId] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkReviewAction | null>(null);
  const [isBulkReviewing, setIsBulkReviewing] = useState(false);
  const [bulkFailures, setBulkFailures] = useState<{ draftId: string; error: string }[]>([]);

  useEffect(() => {
    let isCurrent = true;
    setIsLoadingIntake(true);
    setIntakeError(null);
    setRegisterNotice(null);
    setRegisterError(null);
    setVaultNotice(null);
    setVaultError(null);
    setProcessingSourceId(null);
    setPollingSource(null);
    setProcessNotice(null);
    setProcessError(null);
    setProcessWarnings([]);
    setDraftNotice(null);
    setDraftError(null);
    setSelectedDraftIds([]);
    setPendingBulkAction(null);
    setBulkFailures([]);

    Promise.all([fetchSources(languageId), fetchExtractionDrafts(languageId, "proposed")])
      .then(([loadedSources, loadedDrafts]) => {
        if (!isCurrent) return;
        setSources(loadedSources);
        setDrafts(loadedDrafts);
        // Resume polling if a source was already mid-process when the view loaded.
        const inFlight = loadedSources.find((item) => item.status === "processing");
        if (inFlight) {
          setProcessingSourceId(inFlight.id);
          setPollingSource({ id: inFlight.id, title: inFlight.title });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) setIntakeError(localizeApiError(error, t, "ingest.intakeLoadFailed"));
      })
      .finally(() => {
        if (isCurrent) setIsLoadingIntake(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [languageId, t]);

  async function refreshIntake() {
    const [loadedSources, loadedDrafts] = await Promise.all([
      fetchSources(languageId),
      fetchExtractionDrafts(languageId, "proposed")
    ]);
    setSources(loadedSources);
    setDrafts(loadedDrafts);
    setSelectedDraftIds((previous) => previous.filter((id) => loadedDrafts.some((draft) => draft.id === id)));
  }

  async function handleRegisterSource(event: FormEvent) {
    event.preventDefault();
    const title = registerTitle.trim();
    const rawText = registerText.trim();
    const url = registerUrl.trim();

    if (!title) {
      setRegisterNotice(null);
      setRegisterError(t("ingest.errorTitleRequired"));
      return;
    }

    if (registerKind === "url" ? !url : !rawText) {
      setRegisterNotice(null);
      setRegisterError(registerKind === "url" ? t("ingest.errorUrlRequired") : t("ingest.errorTextRequired"));
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
      setRegisterNotice(t("ingest.sourceRegistered", { title: registered.title }));
      await refreshIntake();
    } catch (error) {
      setRegisterError(localizeApiError(error, t, "ingest.sourceRegistrationFailed"));
    } finally {
      setIsRegisteringSource(false);
    }
  }

  async function handleUploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!uploadFile) {
      setRegisterNotice(null);
      setRegisterError(t("ingest.errorChooseFile"));
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
      setRegisterNotice(t("ingest.fileUploaded", { kind: uploaded.kind, title: uploaded.title }));
      await refreshIntake();
    } catch (error) {
      setRegisterError(localizeApiError(error, t, "ingest.sourceUploadFailed"));
    } finally {
      setIsUploadingSource(false);
    }
  }

  async function handleImportVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPath = vaultPath.trim();
    const maxFiles = Number(vaultMaxFiles);
    if (!trimmedPath) {
      setVaultNotice(null);
      setVaultError(t("ingest.errorVaultPathRequired"));
      return;
    }
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 500) {
      setVaultNotice(null);
      setVaultError(t("ingest.errorVaultMaxFiles"));
      return;
    }

    setIsImportingVault(true);
    setVaultNotice(null);
    setVaultError(null);
    try {
      const result = await importObsidianVault(languageId, {
        vaultPath: trimmedPath,
        includeSubfolders: vaultIncludeSubfolders,
        maxFiles
      });
      const summary = t("ingest.vaultImported", {
        imported: result.summary.imported,
        skipped: result.summary.skipped
      });
      setVaultNotice(
        result.warnings.length > 0
          ? `${summary} ${result.warnings.join(" ")}`
          : summary
      );
      await refreshIntake();
    } catch (error) {
      const message = localizeVaultImportError(error, t, "ingest.vaultImportFailed");
      setVaultError(message);
    } finally {
      setIsImportingVault(false);
    }
  }

  // Poll the source list while a background extraction is running. The
  // first poll fires immediately, then every 2.5s until the asset leaves
  // "processing" or the max duration elapses; cleanup cancels the loop on
  // unmount or language change.
  useEffect(() => {
    if (!pollingSource) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const sourceTitle = pollingSource.title;
    const sourceId = pollingSource.id;

    const isTimedOut = () => Date.now() - startedAt >= INGEST_POLL_MAX_DURATION_MS;

    const stopDueToTimeout = () => {
      setPollingSource(null);
      setProcessingSourceId(null);
      setProcessError(t("ingest.processingTimedOut", { title: sourceTitle }));
      setProcessWarnings([]);
    };

    const scheduleNextPoll = () => {
      if (cancelled || isTimedOut()) {
        if (!cancelled && isTimedOut()) stopDueToTimeout();
        return;
      }
      timer = setTimeout(() => { void poll(); }, INGEST_POLL_INTERVAL_MS);
    };

    const poll = async () => {
      if (cancelled) return;
      if (isTimedOut()) {
        stopDueToTimeout();
        return;
      }

      try {
        const loadedSources = await fetchSources(languageId);
        if (cancelled) return;
        setSources(loadedSources);

        const asset = loadedSources.find((item) => item.id === sourceId);
        if (asset && asset.status === "processing") {
          scheduleNextPoll();
          return;
        }

        setPollingSource(null);
        setProcessingSourceId(null);
        if (!asset) {
          setProcessError(t("ingest.processingFailed", { title: sourceTitle }));
          setProcessWarnings([]);
        } else if (asset.status === "failed") {
          setProcessError(
            asset.error
              ? localizeSourceProcessingError(asset.error, t, "ingest.processingFailed", { title: sourceTitle })
              : t("ingest.processingFailed", { title: sourceTitle })
          );
          setProcessWarnings(asset.warnings ?? []);
        } else {
          setProcessNotice(t("ingest.processingFinished", { title: sourceTitle }));
          setProcessWarnings(asset.warnings ?? []);
        }

        const loadedDrafts = await fetchExtractionDrafts(languageId, "proposed");
        if (!cancelled) setDrafts(loadedDrafts);
      } catch {
        // Transient fetch failure: keep polling until timeout.
        scheduleNextPoll();
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [pollingSource, languageId, t]);

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
      setProcessError(localizeApiError(error, t, "ingest.sourceProcessingFailed"));
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
        setDraftNotice(t("ingest.draftAccepted", { label: t(`draftKind.${result.draft.kind}`) }));
      } else {
        const rejected = await rejectExtractionDraft(draftId);
        setDraftNotice(t("ingest.draftRejected", { label: t(`draftKind.${rejected.kind}`) }));
      }
      await refreshIntake();
      await onIntakeCommitted?.();
    } catch (error) {
      setDraftError(localizeApiError(error, t, "ingest.draftReviewFailed"));
    } finally {
      setReviewingDraftId(null);
    }
  }

  function toggleDraftSelection(draftId: string) {
    setPendingBulkAction(null);
    setSelectedDraftIds((previous) =>
      previous.includes(draftId) ? previous.filter((id) => id !== draftId) : [...previous, draftId]
    );
  }

  function toggleSelectAllProposed() {
    setPendingBulkAction(null);
    setSelectedDraftIds((previous) => (previous.length === drafts.length ? [] : drafts.map((draft) => draft.id)));
  }

  async function handleBulkReview(action: BulkReviewAction) {
    // Two-click confirm: the first click arms the action, the second runs it.
    if (pendingBulkAction !== action) {
      setPendingBulkAction(action);
      return;
    }

    setPendingBulkAction(null);
    setIsBulkReviewing(true);
    setDraftNotice(null);
    setDraftError(null);
    setBulkFailures([]);
    try {
      const result = await bulkReviewExtractionDrafts(languageId, action, selectedDraftIds);
      const succeeded = action === "accept" ? result.accepted : result.rejected;
      const verb = action === "accept" ? t("ingest.bulkVerbAccepted") : t("ingest.bulkVerbRejected");
      const summary = t("ingest.bulkReviewFinished", { succeeded, verb, failed: result.failed });
      if (result.failed > 0) {
        setDraftError(summary);
        setBulkFailures(
          result.results
            .filter((item) => !item.ok)
            .map((item) => ({
              draftId: item.draftId,
              error: localizeExtractionDraftFailure(item.error, t)
            }))
        );
      } else {
        setDraftNotice(summary);
      }
      await refreshIntake();
      if (succeeded > 0) {
        await onIntakeCommitted?.();
      }
    } catch (error) {
      setDraftError(localizeApiError(error, t, "ingest.bulkReviewFailed"));
    } finally {
      setIsBulkReviewing(false);
    }
  }

  return {
    sources,
    drafts,
    isLoadingIntake,
    intakeError,
    registerKind,
    setRegisterKind,
    registerTitle,
    setRegisterTitle,
    registerText,
    setRegisterText,
    registerUrl,
    setRegisterUrl,
    registerNotice,
    registerError,
    isRegisteringSource,
    uploadTitle,
    setUploadTitle,
    uploadFile,
    setUploadFile,
    isUploadingSource,
    vaultPath,
    setVaultPath,
    vaultIncludeSubfolders,
    setVaultIncludeSubfolders,
    vaultMaxFiles,
    setVaultMaxFiles,
    isImportingVault,
    vaultNotice,
    vaultError,
    processingSourceId,
    processNotice,
    processError,
    processWarnings,
    reviewingDraftId,
    draftNotice,
    draftError,
    selectedDraftIds,
    pendingBulkAction,
    isBulkReviewing,
    bulkFailures,
    handleRegisterSource,
    handleUploadSource,
    handleImportVault,
    handleProcessSource,
    handleDraftDecision,
    toggleDraftSelection,
    toggleSelectAllProposed,
    handleBulkReview
  };
}
