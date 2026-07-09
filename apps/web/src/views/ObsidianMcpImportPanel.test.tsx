import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObsidianMcpImportPanel } from "./ObsidianMcpImportPanel";

const apiMock = vi.hoisted(() => ({
  fetchObsidianMcpResources: vi.fn(),
  importObsidianMcpResources: vi.fn()
}));

vi.mock("../api", () => apiMock);

describe("ObsidianMcpImportPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.fetchObsidianMcpResources.mockResolvedValue({
      serverName: "Obsidian Vault",
      resources: [
        { uri: "obsidian://vault/grammar.md", name: "grammar.md", title: "Grammar notes" },
        { uri: "obsidian://vault/lexicon.md", name: "lexicon.md", title: "Lexicon" }
      ]
    });
  });

  it("loads resources and imports only selected note URIs", async () => {
    const onImported = vi.fn();
    apiMock.importObsidianMcpResources.mockResolvedValue({
      imported: [{ id: "source-1" }],
      skipped: [],
      summary: { requested: 1, imported: 1, skipped: 0 }
    });
    render(<ObsidianMcpImportPanel languageId="avenik" onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: "Load MCP notes" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Grammar notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Import selected (1)" }));

    await waitFor(() => {
      expect(apiMock.importObsidianMcpResources).toHaveBeenCalledWith("avenik", {
        uris: ["obsidian://vault/grammar.md"]
      });
    });
    expect(await screen.findByText("Imported 1 notes; skipped 0.")).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("appends paginated resources", async () => {
    apiMock.fetchObsidianMcpResources
      .mockResolvedValueOnce({
        serverName: "Obsidian Vault",
        resources: [{ uri: "obsidian://vault/one.md", name: "one.md", title: "One" }],
        nextCursor: "page-2"
      })
      .mockResolvedValueOnce({
        serverName: "Obsidian Vault",
        resources: [{ uri: "obsidian://vault/two.md", name: "two.md", title: "Two" }]
      });
    render(<ObsidianMcpImportPanel languageId="avenik" />);

    fireEvent.click(screen.getByRole("button", { name: "Load MCP notes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load more notes" }));

    expect(await screen.findByText("Two")).toBeInTheDocument();
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(apiMock.fetchObsidianMcpResources).toHaveBeenLastCalledWith("page-2");
  });
});
