import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n";
import { IngestView } from "./views/IngestView";
import type { ExtractionDraftView } from "./api";

const apiMock = vi.hoisted(() => ({
  acceptExtractionDraft: vi.fn(),
  bulkReviewExtractionDrafts: vi.fn(),
  fetchExtractionDrafts: vi.fn(),
  fetchSources: vi.fn(),
  processSource: vi.fn(),
  registerSource: vi.fn(),
  rejectExtractionDraft: vi.fn(),
  uploadSourceFile: vi.fn()
}));

vi.mock("./api", () => apiMock);

function createConflictDraft(overrides: Partial<ExtractionDraftView> = {}): ExtractionDraftView {
  return {
    id: "draft-seg-conflict",
    languageId: "avenik",
    sourceAssetId: "asset-1",
    kind: "corpus_passage",
    payload: {
      textTarget: "mira talo-na",
      textTranslation: "I walk by the river.",
      tags: [],
      topicTags: [],
      morphologicalSegmentation: [
        { surface: "mira", lemma: "mira", gloss: "lake", features: ["noun"] },
        { surface: "talo", lemma: "talo", gloss: "run", features: ["verb"] },
        { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] }
      ]
    },
    confidence: "medium",
    status: "proposed",
    createdAt: "2026-06-12T00:00:00.000Z",
    grounding: [
      {
        kind: "segmentation_conflict",
        message: 'Segment "mira" is glossed "lake" in this draft, but the accepted lexeme "mira" is glossed "river".'
      }
    ],
    lexiconSegmentationProposal: [
      { surface: "mira", lemma: "mira", gloss: "river", features: ["place"] },
      { surface: "talo", lemma: "talo", gloss: "walk", features: ["motion"] },
      { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] }
    ],
    ...overrides
  };
}

beforeEach(() => {
  apiMock.fetchSources.mockResolvedValue([]);
  apiMock.acceptExtractionDraft.mockResolvedValue({
    draft: { ...createConflictDraft(), status: "accepted" },
    entity: {}
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("IngestView segmentation conflict resolution", () => {
  it("shows an expandable compare panel and keeps draft on Keep draft", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValue([createConflictDraft()]);

    render(
      <I18nProvider>
        <IngestView languageId="avenik" />
      </I18nProvider>
    );

    const row = await screen.findByRole("article", { name: "Extraction draft draft-seg-conflict" });
    expect(within(row).getByText("Segment gloss conflicts with lexicon")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Accept draft draft-seg-conflict" })).not.toBeInTheDocument();

    const details = within(row).getByText("Resolve segmentation conflict").closest("details");
    expect(details).toBeTruthy();
    if (details) {
      details.open = true;
    }

    expect(within(row).getByText("Draft segmentation")).toBeInTheDocument();
    expect(within(row).getByText("Lexicon proposal")).toBeInTheDocument();
    expect(within(row).getByText("mira — lake")).toBeInTheDocument();
    expect(within(row).getByText("mira — river")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Keep draft" }));

    await waitFor(() => {
      expect(apiMock.acceptExtractionDraft).toHaveBeenCalledWith("draft-seg-conflict", undefined);
    });
  });

  it("accepts with preferLexiconSegmentation when Prefer lexicon is clicked", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValue([createConflictDraft()]);

    render(
      <I18nProvider>
        <IngestView languageId="avenik" />
      </I18nProvider>
    );

    const row = await screen.findByRole("article", { name: "Extraction draft draft-seg-conflict" });
    const details = within(row).getByText("Resolve segmentation conflict").closest("details");
    if (details) details.open = true;

    fireEvent.click(within(row).getByRole("button", { name: "Prefer lexicon" }));

    await waitFor(() => {
      expect(apiMock.acceptExtractionDraft).toHaveBeenCalledWith("draft-seg-conflict", {
        preferLexiconSegmentation: true
      });
    });
  });

  it("accepts edited glosses through morphologicalSegmentation", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValue([createConflictDraft()]);

    render(
      <I18nProvider>
        <IngestView languageId="avenik" />
      </I18nProvider>
    );

    const row = await screen.findByRole("article", { name: "Extraction draft draft-seg-conflict" });
    const details = within(row).getByText("Resolve segmentation conflict").closest("details");
    if (details) details.open = true;

    fireEvent.click(within(row).getByRole("button", { name: "Edit glosses" }));
    const glossInput = within(row).getByLabelText("Gloss for mira");
    fireEvent.change(glossInput, { target: { value: "stream" } });
    fireEvent.click(within(row).getByRole("button", { name: "Accept edited" }));

    await waitFor(() => {
      expect(apiMock.acceptExtractionDraft).toHaveBeenCalledWith(
        "draft-seg-conflict",
        expect.objectContaining({
          morphologicalSegmentation: expect.arrayContaining([
            expect.objectContaining({ surface: "mira", gloss: "stream" })
          ])
        })
      );
    });
  });
});
