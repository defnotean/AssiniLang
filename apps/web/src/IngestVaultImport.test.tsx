import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IngestView } from "./views/IngestView";

const apiMock = vi.hoisted(() => ({
  acceptExtractionDraft: vi.fn(),
  bulkReviewExtractionDrafts: vi.fn(),
  fetchExtractionDrafts: vi.fn(),
  fetchSources: vi.fn(),
  importObsidianVault: vi.fn(),
  processSource: vi.fn(),
  registerSource: vi.fn(),
  rejectExtractionDraft: vi.fn(),
  uploadSourceFile: vi.fn()
}));

vi.mock("./api", () => apiMock);

const LANGUAGE_ID = "avenik";
const VAULT_PATH = "C:\\Users\\test\\Documents\\Obsidian\\Language Vault";

async function renderIngestView() {
  render(<IngestView languageId={LANGUAGE_ID} />);
  await screen.findByRole("form", { name: "Obsidian vault import" });
}

describe("IngestView Obsidian vault import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.fetchSources.mockResolvedValue([]);
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
  });

  it("shows imported and skipped counts after a successful vault import", async () => {
    apiMock.importObsidianVault.mockResolvedValue({
      imported: [],
      skipped: [],
      warnings: [],
      summary: { scanned: 3, imported: 2, skipped: 1 }
    });

    await renderIngestView();

    fireEvent.change(screen.getByLabelText("Vault folder path"), {
      target: { value: VAULT_PATH }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import vault sources" }));

    await waitFor(() => {
      expect(apiMock.importObsidianVault).toHaveBeenCalledWith(LANGUAGE_ID, {
        vaultPath: VAULT_PATH,
        includeSubfolders: true,
        maxFiles: 100
      });
    });
    await screen.findByText("Vault import finished: 2 imported, 1 skipped.");
  });

  it("surfaces allowlist errors in the vault error UI", async () => {
    apiMock.importObsidianVault.mockRejectedValue(
      new Error(
        "Obsidian vault import failed (400): Obsidian vault path is outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist."
      )
    );

    await renderIngestView();

    fireEvent.change(screen.getByLabelText("Vault folder path"), {
      target: { value: VAULT_PATH }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import vault sources" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "That folder is outside the allowed vault roots. Update ASSINI_OBSIDIAN_VAULT_ROOTS or choose a folder under an allowed root."
    );
  });

  it("surfaces unreadable vault paths with operator guidance", async () => {
    apiMock.importObsidianVault.mockRejectedValue(
      new Error("Obsidian vault import failed (400): Obsidian vault path could not be read.")
    );

    await renderIngestView();

    fireEvent.change(screen.getByLabelText("Vault folder path"), {
      target: { value: VAULT_PATH }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import vault sources" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "That folder could not be read. Check the path exists and AssiniLang can access it."
    );
  });

  it("disables the import button while a vault import is running", async () => {
    let resolveImport: (value: unknown) => void = () => {};
    apiMock.importObsidianVault.mockImplementation(
      () => new Promise((resolve) => { resolveImport = resolve; })
    );

    await renderIngestView();

    fireEvent.change(screen.getByLabelText("Vault folder path"), {
      target: { value: VAULT_PATH }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import vault sources" }));

    const busyButton = await screen.findByRole("button", { name: "Importing vault..." });
    expect(busyButton).toBeDisabled();

    resolveImport({
      imported: [],
      skipped: [],
      warnings: [],
      summary: { scanned: 1, imported: 1, skipped: 0 }
    });
    await screen.findByText("Vault import finished: 1 imported, 0 skipped.");
  });
});
