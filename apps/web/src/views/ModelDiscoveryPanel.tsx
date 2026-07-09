import { useEffect, useState } from "react";
import type { DiscoveredLlmModel, LlmModelDiscoveryResponse } from "../api";
import { useI18n } from "../i18n";
import { discoveredModelLabel, modelDisplayName, sameModelBaseUrl } from "../lib/modelFormatting";
import type { StaleActiveModel } from "../lib/modelSettings";
import type { AsyncState } from "../lib/types";

type ModelDiscoveryPanelProps = {
  connectedEndpoints: LlmModelDiscoveryResponse["endpoints"];
  discoveryErrors: LlmModelDiscoveryResponse["errors"];
  discoveredModels: DiscoveredLlmModel[];
  failedEndpoints: LlmModelDiscoveryResponse["endpoints"];
  formBaseUrl: string;
  isAutoRefreshingModels: boolean;
  isSavingSettings: boolean;
  isScanningModels: boolean;
  lastModelScan: string | null;
  modelDiscoveryState: AsyncState<LlmModelDiscoveryResponse>;
  onApplyLoadedModel: (candidate: DiscoveredLlmModel) => void | Promise<void>;
  onClearSavedModel: () => void | Promise<void>;
  onDiscoveredModelChange: (value: string) => void | Promise<void>;
  onRefreshModelDiscovery: (baseUrl?: string) => Promise<void>;
  selectedDiscoveredModelId: string;
  staleActiveModel: StaleActiveModel | null;
};

export function ModelDiscoveryPanel({
  connectedEndpoints,
  discoveryErrors,
  discoveredModels,
  failedEndpoints,
  formBaseUrl,
  isAutoRefreshingModels,
  isSavingSettings,
  isScanningModels,
  lastModelScan,
  modelDiscoveryState,
  onApplyLoadedModel,
  onClearSavedModel,
  onDiscoveredModelChange,
  onRefreshModelDiscovery,
  selectedDiscoveredModelId,
  staleActiveModel
}: ModelDiscoveryPanelProps) {
  const { t } = useI18n();

  function discoveredModelNamesForEndpoint(endpoint: LlmModelDiscoveryResponse["endpoints"][number]): string[] {
    return [...new Set(
      discoveredModels
        .filter((candidate) => sameModelBaseUrl(candidate.baseUrl, endpoint.baseUrl))
        .map((candidate) => modelDisplayName(candidate.model))
    )];
  }

  function fullDiscoveredModelNamesForEndpoint(endpoint: LlmModelDiscoveryResponse["endpoints"][number]): string {
    return [...new Set(
      discoveredModels
        .filter((candidate) => sameModelBaseUrl(candidate.baseUrl, endpoint.baseUrl))
        .map((candidate) => candidate.model)
    )].join(", ");
  }

  function connectedEndpointMessage(endpoint: LlmModelDiscoveryResponse["endpoints"][number]): string {
    const modelNames = discoveredModelNamesForEndpoint(endpoint);
    if (modelNames.length === 1) {
      return t("model.endpointConnectedOneNamed", { model: modelNames[0], baseUrl: endpoint.baseUrl });
    }
    if (modelNames.length > 1) {
      return t("model.endpointConnectedNamed", {
        baseUrl: endpoint.baseUrl,
        count: modelNames.length,
        models: modelNames.slice(0, 3).join(", ")
      });
    }
    if (endpoint.modelCount === 1) {
      return t("model.endpointConnectedOne", { baseUrl: endpoint.baseUrl });
    }
    if (endpoint.modelCount > 1) {
      return t("model.endpointConnected", { baseUrl: endpoint.baseUrl, count: endpoint.modelCount });
    }
    return t("model.endpointConnectedNoModels", { baseUrl: endpoint.baseUrl });
  }

  const visibleConnectedEndpoints = connectedEndpoints.slice(0, 2);
  const visibleFailedEndpoints = failedEndpoints.slice(0, 2);
  const visibleDiscoveryErrors = failedEndpoints.length === 0 && connectedEndpoints.length === 0
    ? discoveryErrors.slice(0, 2)
    : [];
  const connectionAnnouncementSignature = visibleConnectedEndpoints
    .map((endpoint) => connectedEndpointMessage(endpoint))
    .join(" ");
  const errorAnnouncementSignature = [
    ...visibleFailedEndpoints.map((endpoint) => t("model.endpointConnectionFailed", {
      baseUrl: endpoint.baseUrl,
      detail: endpoint.detail ?? t("model.errModelDiscoveryFailed")
    })),
    ...visibleDiscoveryErrors.map((error) => t("model.endpointConnectionFailed", {
      baseUrl: error.baseUrl,
      detail: error.detail
    }))
  ].join(" ");
  const [connectionAnnouncement, setConnectionAnnouncement] = useState("");
  const [errorAnnouncement, setErrorAnnouncement] = useState("");

  useEffect(() => {
    setConnectionAnnouncement((current) => (
      current === connectionAnnouncementSignature ? current : connectionAnnouncementSignature
    ));
  }, [connectionAnnouncementSignature]);

  useEffect(() => {
    setErrorAnnouncement((current) => (
      current === errorAnnouncementSignature ? current : errorAnnouncementSignature
    ));
  }, [errorAnnouncementSignature]);

  return (
    <div className="form-group wide">
      <label htmlFor="discovered-model">{t("model.discoveredModels")}</label>
      <div className="settings-inline-row">
        <select
          id="discovered-model"
          value={selectedDiscoveredModelId}
          disabled={isSavingSettings || isScanningModels || discoveredModels.length === 0}
          onChange={(event) => void onDiscoveredModelChange(event.target.value)}
        >
          <option value="">
            {isScanningModels
              ? t("model.scanningModels")
              : discoveredModels.length > 0
                ? t("model.chooseDiscoveredModel")
                : t("model.noDiscoveredModels")}
          </option>
          {discoveredModels.map((candidate) => (
            <option
              key={candidate.id}
              value={candidate.id}
              title={`${candidate.model} (${candidate.providerLabel}, ${candidate.baseUrl})`}
            >
              {discoveredModelLabel(candidate)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="secondary"
          disabled={isSavingSettings || isScanningModels}
          onClick={() => void onRefreshModelDiscovery(formBaseUrl.trim() || undefined)}
        >
          {isScanningModels ? t("model.scanningModels") : t("model.refreshModels")}
        </button>
      </div>
      {modelDiscoveryState.status === "error" && (
        <div className="inline-error" role="alert" aria-live="assertive">
          <p>{modelDiscoveryState.message}</p>
          <p className="muted">{t("model.discoveryFailedHint")}</p>
        </div>
      )}
      {modelDiscoveryState.status === "ready" && discoveredModels.length === 0 && !isScanningModels && (
        <p className="muted empty-state" role="status" aria-live="polite">
          {t("model.noDiscoveredModelsHint")}
        </p>
      )}
      {modelDiscoveryState.status === "ready" && (
        <p className="model-scan-meta">
          {isAutoRefreshingModels
            ? t("model.autoRefreshingModels")
            : lastModelScan
              ? t("model.lastModelScan", { time: lastModelScan })
              : t("model.autoDiscoveryActive")}
        </p>
      )}
      {connectionAnnouncement && (
        <p className="visually-hidden" role="status" aria-live="polite">
          {t("model.discoveredModels")}: {connectionAnnouncement}
        </p>
      )}
      {errorAnnouncement && (
        <p className="visually-hidden" role="alert" aria-live="assertive">
          {t("model.discoveredModels")}: {errorAnnouncement}
        </p>
      )}
      {visibleConnectedEndpoints.map((endpoint) => (
        <p
          key={`connected:${endpoint.source}:${endpoint.baseUrl}`}
          className="result-notice"
          title={fullDiscoveredModelNamesForEndpoint(endpoint)}
        >
          {connectedEndpointMessage(endpoint)}
        </p>
      ))}
      {staleActiveModel && (
        <div className="result-notice warning stale-model-notice" role="status" aria-live="polite">
          <p>
            {staleActiveModel.replacement
              ? t("model.savedModelUnavailableWithReplacement", {
                baseUrl: staleActiveModel.baseUrl,
                model: staleActiveModel.savedModelDisplay,
                replacement: modelDisplayName(staleActiveModel.replacement.model)
              })
              : t("model.savedModelUnavailable", {
                baseUrl: staleActiveModel.baseUrl,
                model: staleActiveModel.savedModelDisplay
              })}
          </p>
          <div className="settings-actions">
            {staleActiveModel.replacement && (
              <button
                type="button"
                className="secondary"
                disabled={isSavingSettings}
                onClick={() => void onApplyLoadedModel(staleActiveModel.replacement!)}
              >
                {t("model.applyLoadedModel")}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={isSavingSettings}
              onClick={() => void onClearSavedModel()}
            >
              {t("model.clearSavedModel")}
            </button>
          </div>
        </div>
      )}
      {visibleFailedEndpoints.map((endpoint) => (
        <p
          key={`failed:${endpoint.source}:${endpoint.baseUrl}:${endpoint.detail}`}
          className="inline-error"
        >
          {t("model.endpointConnectionFailed", {
            baseUrl: endpoint.baseUrl,
            detail: endpoint.detail ?? t("model.errModelDiscoveryFailed")
          })}
        </p>
      ))}
      {visibleDiscoveryErrors.map((error) => (
        <p
          key={`${error.source}:${error.baseUrl}:${error.detail}`}
          className="inline-error"
        >
          {t("model.endpointConnectionFailed", { baseUrl: error.baseUrl, detail: error.detail })}
        </p>
      ))}
    </div>
  );
}
