import { useState } from "react";
import { fetchObsidianMcpResources, importObsidianMcpResources, type ObsidianMcpResourceList } from "../api";
import { useI18n } from "../i18n";

export function ObsidianMcpImportPanel({
  languageId,
  onImported
}: {
  languageId: string;
  onImported?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [resourceList, setResourceList] = useState<ObsidianMcpResourceList | null>(null);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadResources(cursor?: string) {
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const next = await fetchObsidianMcpResources(cursor);
      setResourceList((current) =>
        cursor && current ? { ...next, resources: [...current.resources, ...next.resources] } : next
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("mcp.resourcesLoadFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  function toggleResource(uri: string) {
    setSelectedUris((current) =>
      current.includes(uri) ? current.filter((item) => item !== uri) : current.length < 50 ? [...current, uri] : current
    );
  }

  async function handleImport() {
    if (selectedUris.length === 0) return;
    setIsImporting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await importObsidianMcpResources(languageId, { uris: selectedUris });
      setSelectedUris([]);
      setNotice(
        t("mcp.importComplete", {
          imported: result.summary.imported,
          skipped: result.summary.skipped
        })
      );
      await onImported?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("mcp.importFailed"));
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section
      className="record-card form-panel compact"
      aria-label={t("mcp.importAria")}
      aria-busy={isLoading || isImporting}
    >
      <div className="record-topline">
        <div>
          <span className="detail-label">{t("mcp.integration")}</span>
          <h3>{t("mcp.importHeading")}</h3>
        </div>
        {resourceList?.serverName && <span className="status-badge approved">{resourceList.serverName}</span>}
      </div>
      <div className="settings-actions">
        <button
          type="button"
          className="secondary"
          disabled={isLoading || isImporting}
          aria-busy={isLoading}
          onClick={() => void loadResources()}
        >
          {isLoading ? t("mcp.loadingResources") : resourceList ? t("mcp.refreshResources") : t("mcp.loadResources")}
        </button>
        <button
          type="button"
          disabled={isLoading || isImporting || selectedUris.length === 0}
          aria-busy={isImporting}
          onClick={() => void handleImport()}
        >
          {isImporting ? t("mcp.importing") : t("mcp.importSelected", { count: selectedUris.length })}
        </button>
      </div>
      {notice && (
        <p className="result-notice" role="status" aria-live="polite">
          {notice}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
      {resourceList && resourceList.resources.length === 0 && (
        <p className="muted empty-state" role="status">
          {t("mcp.noResources")}
        </p>
      )}
      {resourceList && resourceList.resources.length > 0 && (
        <div className="checkbox-list" aria-label={t("mcp.availableResources")}>
          {resourceList.resources.map((resource) => (
            <label className="checkbox-row" key={resource.uri} title={resource.uri}>
              <input
                type="checkbox"
                checked={selectedUris.includes(resource.uri)}
                disabled={isImporting}
                onChange={() => toggleResource(resource.uri)}
              />
              <span>
                <strong>{resource.title ?? resource.name}</strong>
                {resource.description && <small>{resource.description}</small>}
              </span>
            </label>
          ))}
        </div>
      )}
      {resourceList?.nextCursor && (
        <button
          type="button"
          className="ghost"
          disabled={isLoading || isImporting}
          onClick={() => void loadResources(resourceList.nextCursor)}
        >
          {t("mcp.loadMore")}
        </button>
      )}
    </section>
  );
}
