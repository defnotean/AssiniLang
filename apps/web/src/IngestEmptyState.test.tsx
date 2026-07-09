import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("IngestView empty-state guidance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.fetchSources.mockResolvedValue([]);
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
  });

  it("guides operators to register then process when intake queues are empty", async () => {
    render(<IngestView languageId="avenik" />);

    const sourcesEmpty = await screen.findByText("No sources registered yet.");
    const sourcesStatus = sourcesEmpty.closest("[role='status']");
    expect(sourcesStatus).toHaveAttribute("aria-live", "polite");
    expect(sourcesStatus).toHaveTextContent(
      "Add raw text, a word list, or a URL above, upload a file, or import Markdown notes from an Obsidian vault. Then process the source to propose drafts."
    );

    await waitFor(() => {
      expect(screen.getByText("No proposed extraction drafts.")).toBeInTheDocument();
    });
    const draftsEmpty = screen.getByText("No proposed extraction drafts.").closest("[role='status']");
    expect(draftsEmpty).toHaveAttribute("aria-live", "polite");
    expect(draftsEmpty).toHaveTextContent(
      "Process a registered source above to propose lexemes, passages, and grammar notes. Accept drafts here; grammar notes then appear in Review."
    );
  });
});
