import { useEffect, useState } from "react";
import type { DashboardData, LlmReachability, LlmStatus, ObservabilityData } from "../api";
import { checkLlmReachability, createAiSession, fetchLlmStatus, fetchObservability } from "../api";
import { isRealModelProvider, latestAssistantMessage, sessionUsedDeterministicFallback } from "../lib/format";
import type { AsyncState, ViewMode } from "../lib/types";

export interface ModelWorkspace {
  llmState: AsyncState<LlmStatus>;
  observabilityState: AsyncState<ObservabilityData>;
  isTestingModel: boolean;
  modelTestResult: string | null;
  modelTestIsPlaceholder: boolean;
  isCheckingReachability: boolean;
  reachabilityResult: LlmReachability | null;
  reachabilityError: string | null;
  refreshModelObservability: () => Promise<void>;
  handleModelSmokeTest: () => Promise<void>;
  handleTestConnection: () => Promise<void>;
}

/**
 * Owns the model setup workspace state: LLM status, observability, the smoke
 * test, and the reachability check, plus the model-view loading effect.
 */
export function useModelWorkspace(
  view: ViewMode,
  selectedLanguageId: string | null,
  data: DashboardData | null
): ModelWorkspace {
  const [llmState, setLlmState] = useState<AsyncState<LlmStatus>>({ status: "idle" });
  const [observabilityState, setObservabilityState] = useState<AsyncState<ObservabilityData>>({ status: "idle" });
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<string | null>(null);
  const [modelTestIsPlaceholder, setModelTestIsPlaceholder] = useState(false);
  const [isCheckingReachability, setIsCheckingReachability] = useState(false);
  const [reachabilityResult, setReachabilityResult] = useState<LlmReachability | null>(null);
  const [reachabilityError, setReachabilityError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    if (view !== "model") return () => {
      isCurrent = false;
    };

    setLlmState({ status: "loading" });
    setObservabilityState({ status: "loading" });
    setModelTestResult(null);
    fetchLlmStatus()
      .then((status) => {
        if (isCurrent) setLlmState({ status: "ready", data: status });
      })
      .catch((error: Error) => {
        if (isCurrent) setLlmState({ status: "error", message: error.message });
      });
    fetchObservability()
      .then((observability) => {
        if (isCurrent) setObservabilityState({ status: "ready", data: observability });
      })
      .catch((error: Error) => {
        if (isCurrent) setObservabilityState({ status: "error", message: error.message });
      });

    return () => {
      isCurrent = false;
    };
  }, [view]);

  async function refreshModelObservability() {
    setObservabilityState({ status: "loading" });
    try {
      setObservabilityState({ status: "ready", data: await fetchObservability() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model observability failed";
      setObservabilityState({ status: "error", message });
    }
  }

  async function handleModelSmokeTest() {
    if (!data) return;
    if (!selectedLanguageId) {
      setModelTestResult("Select or create a language first.");
      return;
    }
    setIsTestingModel(true);
    setModelTestResult(null);
    setModelTestIsPlaceholder(false);
    try {
      const session = await createAiSession({
        languageId: selectedLanguageId,
        mode: "learner_practice",
        seedPrompt: "Create one concise, safe practice prompt using only the provided public workspace context.",
        contextNoteIds: data.notes.slice(0, 2).map((note) => note.id),
        contextPassageIds: data.corpus.slice(0, 2).map((passage) => passage.id)
      });
      setModelTestResult(latestAssistantMessage(session));
      const refreshedStatus = await fetchLlmStatus();
      setLlmState({ status: "ready", data: refreshedStatus });
      // The reply is a genuine model answer only when a real provider is
      // configured. Deterministic/invalid modes return a canned offline string,
      // and the session trace may flag the deterministic fallback as well.
      setModelTestIsPlaceholder(!isRealModelProvider(refreshedStatus) || sessionUsedDeterministicFallback(session));
      await refreshModelObservability();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model smoke test failed";
      setModelTestResult(message);
      setModelTestIsPlaceholder(false);
      await refreshModelObservability();
    } finally {
      setIsTestingModel(false);
    }
  }

  async function handleTestConnection() {
    setIsCheckingReachability(true);
    setReachabilityError(null);
    setReachabilityResult(null);
    try {
      setReachabilityResult(await checkLlmReachability());
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM reachability check failed";
      setReachabilityError(message);
    } finally {
      setIsCheckingReachability(false);
    }
  }

  return {
    llmState,
    observabilityState,
    isTestingModel,
    modelTestResult,
    modelTestIsPlaceholder,
    isCheckingReachability,
    reachabilityResult,
    reachabilityError,
    refreshModelObservability,
    handleModelSmokeTest,
    handleTestConnection
  };
}
