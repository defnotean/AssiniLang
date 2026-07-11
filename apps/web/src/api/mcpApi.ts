import type {
  ObsidianMcpConnectionStatus,
  ObsidianMcpImportPayload,
  ObsidianMcpImportResponse,
  ObsidianMcpResourceList,
  ObsidianMcpSettings,
  ObsidianMcpSettingsPatch
} from "@assini/api-contract";
import { actorJsonRequest, fetchAsActor, getJson, assertOk } from "../lib/apiClient";

export async function fetchObsidianMcpSettings(): Promise<ObsidianMcpSettings> {
  return getJson<ObsidianMcpSettings>("/integrations/obsidian-mcp/settings", "programmer");
}

export async function updateObsidianMcpSettings(patch: ObsidianMcpSettingsPatch): Promise<ObsidianMcpSettings> {
  return actorJsonRequest<ObsidianMcpSettings>(
    "programmer",
    "/api/integrations/obsidian-mcp/settings",
    { method: "PUT", body: JSON.stringify(patch) },
    "Obsidian MCP settings update failed"
  );
}

export async function testObsidianMcpConnection(): Promise<ObsidianMcpConnectionStatus> {
  return actorJsonRequest<ObsidianMcpConnectionStatus>(
    "programmer",
    "/api/integrations/obsidian-mcp/test",
    { method: "POST" },
    "Obsidian MCP connection test failed"
  );
}

export async function fetchObsidianMcpResources(cursor?: string): Promise<ObsidianMcpResourceList> {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return getJson<ObsidianMcpResourceList>(`/integrations/obsidian-mcp/resources${suffix}`, "reviewer", {
    cache: "no-store"
  });
}

export async function importObsidianMcpResources(
  languageId: string,
  payload: ObsidianMcpImportPayload
): Promise<ObsidianMcpImportResponse> {
  const response = await fetchAsActor(
    "reviewer",
    `/api/languages/${encodeURIComponent(languageId)}/sources/obsidian-mcp`,
    { method: "POST", body: JSON.stringify(payload) },
    true
  );
  await assertOk(response, "Obsidian MCP import failed");
  return response.json() as Promise<ObsidianMcpImportResponse>;
}

export type {
  ObsidianMcpConnectionStatus,
  ObsidianMcpImportResponse,
  ObsidianMcpResourceList,
  ObsidianMcpSettings,
  ObsidianMcpSettingsPatch
} from "@assini/api-contract";
