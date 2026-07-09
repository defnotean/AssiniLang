import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObsidianMcpSettingsPanel } from "./ObsidianMcpSettingsPanel";

const apiMock = vi.hoisted(() => ({
  fetchObsidianMcpSettings: vi.fn(),
  testObsidianMcpConnection: vi.fn(),
  updateObsidianMcpSettings: vi.fn()
}));

vi.mock("../api", () => apiMock);

describe("ObsidianMcpSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.fetchObsidianMcpSettings.mockResolvedValue({
      endpointUrl: "",
      tokenConfigured: false,
      timeoutMs: 15_000
    });
  });

  it("persists endpoint, timeout, and a write-only token", async () => {
    apiMock.updateObsidianMcpSettings.mockResolvedValue({
      endpointUrl: "http://127.0.0.1:3001/mcp",
      tokenConfigured: true,
      timeoutMs: 20_000
    });
    render(<ObsidianMcpSettingsPanel />);

    fireEvent.change(await screen.findByLabelText("MCP endpoint"), {
      target: { value: "http://127.0.0.1:3001/mcp" }
    });
    fireEvent.change(screen.getByLabelText("Bearer token"), {
      target: { value: "secret-token" }
    });
    fireEvent.change(screen.getByLabelText("Request timeout (ms)"), {
      target: { value: "20000" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save MCP settings" }));

    await waitFor(() => {
      expect(apiMock.updateObsidianMcpSettings).toHaveBeenCalledWith({
        endpointUrl: "http://127.0.0.1:3001/mcp",
        token: "secret-token",
        clearToken: undefined,
        timeoutMs: 20_000
      });
    });
    expect(await screen.findByText("Obsidian MCP settings saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("Bearer token")).toHaveValue("");
  });

  it("reports the connected server name and resource count", async () => {
    apiMock.fetchObsidianMcpSettings.mockResolvedValue({
      endpointUrl: "http://127.0.0.1:3001/mcp",
      tokenConfigured: false,
      timeoutMs: 15_000
    });
    apiMock.testObsidianMcpConnection.mockResolvedValue({
      configured: true,
      connected: true,
      serverName: "Obsidian Vault",
      serverVersion: "1.0.0",
      resourceCount: 12,
      latencyMs: 8
    });
    render(<ObsidianMcpSettingsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Test MCP connection" }));

    expect(await screen.findByText("Connected to Obsidian Vault. 12 resources available (8 ms).")).toBeInTheDocument();
    expect(screen.getByText("Obsidian Vault")).toHaveClass("status-badge", "approved");
  });

  it("surfaces an unsuccessful connection probe", async () => {
    apiMock.fetchObsidianMcpSettings.mockResolvedValue({
      endpointUrl: "http://127.0.0.1:3001/mcp",
      tokenConfigured: false,
      timeoutMs: 15_000
    });
    apiMock.testObsidianMcpConnection.mockResolvedValue({
      configured: true,
      connected: false,
      latencyMs: 14,
      detail: "Connection refused"
    });
    render(<ObsidianMcpSettingsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Test MCP connection" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Connection refused");
  });
});
