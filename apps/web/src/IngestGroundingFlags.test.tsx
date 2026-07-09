import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

function createLexemeDraft(overrides: Partial<ExtractionDraftView> = {}): ExtractionDraftView {
  return {
    id: "draft-talune",
    languageId: "avenik",
    sourceAssetId: "asset-1",
    kind: "lexeme",
    payload: {
      form: "talune",
      gloss: "swims",
      tags: [],
      morphologicalSegmentation: [],
      topicTags: []
    },
    confidence: "medium",
    status: "proposed",
    createdAt: "2026-06-11T00:00:00.000Z",
    ...overrides
  };
}

beforeEach(() => {
  apiMock.fetchSources.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("IngestView grounding flag badges", () => {
  it("renders a warning badge per grounding flag with the message as tooltip", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValue([
      createLexemeDraft({
        grounding: [
          {
            kind: "decomposable_form",
            message: 'Form decomposes into accepted lexemes talu ("water") + ne ("locative case marker"); the draft gloss may belong to a different word.'
          }
        ]
      }),
      createLexemeDraft({
        id: "draft-talu",
        payload: { form: "talu", gloss: "swims", tags: [], morphologicalSegmentation: [], topicTags: [] },
        grounding: [
          {
            kind: "gloss_conflict",
            message: 'Accepted lexeme "talu" is glossed "water", but this draft glosses it "swims".'
          }
        ]
      }),
      createLexemeDraft({ id: "draft-clean", payload: { form: "miro", gloss: "river", tags: [], morphologicalSegmentation: [], topicTags: [] } })
    ]);

    render(
      <I18nProvider>
        <IngestView languageId="avenik" />
      </I18nProvider>
    );

    const flaggedRow = await screen.findByRole("article", { name: "Extraction draft draft-talune" });
    const decomposableBadge = within(flaggedRow).getByText("Form decomposes into accepted lexemes");
    expect(decomposableBadge).toHaveClass("status-badge");
    expect(decomposableBadge).toHaveAttribute(
      "title",
      'Form decomposes into accepted lexemes talu ("water") + ne ("locative case marker"); the draft gloss may belong to a different word.'
    );

    const conflictRow = screen.getByRole("article", { name: "Extraction draft draft-talu" });
    expect(within(conflictRow).getByText("Conflicts with accepted gloss")).toBeInTheDocument();
    expect(within(conflictRow).getByText("Conflicts with accepted gloss")).toHaveAttribute(
      "title",
      'Accepted lexeme "talu" is glossed "water", but this draft glosses it "swims".'
    );

    const cleanRow = screen.getByRole("article", { name: "Extraction draft draft-clean" });
    expect(within(cleanRow).queryByText("Form decomposes into accepted lexemes")).not.toBeInTheDocument();
    expect(within(cleanRow).queryByText("Conflicts with accepted gloss")).not.toBeInTheDocument();
  });  it("renders grounding badges alongside an existing duplicate badge", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValue([
      createLexemeDraft({
        duplicate: { kind: "form", entityId: "lex-talu" },
        grounding: [
          { kind: "gloss_conflict", message: 'Accepted lexeme "talu" is glossed "water", but this draft glosses it "swims".' }
        ]
      })
    ]);

    render(
      <I18nProvider>
        <IngestView languageId="avenik" />
      </I18nProvider>
    );

    const row = await screen.findByRole("article", { name: "Extraction draft draft-talune" });
    await waitFor(() => {
      expect(within(row).getByText("Same form, different gloss")).toBeInTheDocument();
      expect(within(row).getByText("Conflicts with accepted gloss")).toBeInTheDocument();
    });
  });
});
