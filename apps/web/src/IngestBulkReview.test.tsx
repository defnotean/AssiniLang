import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./lib/apiClient";
import { IngestView } from "./views/IngestView";

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

const LANGUAGE_ID = "avenik";

function buildDraft(id: string, form: string) {
  return {
    id,
    languageId: LANGUAGE_ID,
    sourceAssetId: "source-1",
    kind: "lexeme" as const,
    status: "proposed" as const,
    confidence: "medium" as const,
    createdAt: "2026-06-10T00:00:00.000Z",
    payload: { form, gloss: `gloss of ${form}`, tags: [], morphologicalSegmentation: [], topicTags: [] }
  };
}

const DRAFTS = [buildDraft("draft-1", "mira"), buildDraft("draft-2", "saku"), buildDraft("draft-3", "pelu")];

async function renderIngestView() {
  render(<IngestView languageId={LANGUAGE_ID} />);
  await screen.findByText("3 proposed drafts");
}

describe("IngestView bulk draft review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.fetchSources.mockResolvedValue([]);
    apiMock.fetchExtractionDrafts.mockResolvedValue(DRAFTS);
  });

  it("requires a second confirming click before calling the bulk API", async () => {
    await renderIngestView();

    fireEvent.click(screen.getByLabelText("Select draft draft-1"));
    fireEvent.click(screen.getByLabelText("Select draft draft-2"));

    const acceptButton = screen.getByRole("button", { name: "Accept selected" });
    fireEvent.click(acceptButton);
    expect(apiMock.bulkReviewExtractionDrafts).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm accept selected" })).toBeInTheDocument();
  });

  it("accepts selected drafts in bulk and refreshes the queue", async () => {
    apiMock.bulkReviewExtractionDrafts.mockResolvedValue({
      results: [
        { draftId: "draft-1", ok: true, committedEntityId: "lex-1" },
        { draftId: "draft-2", ok: true, committedEntityId: "lex-2" }
      ],
      accepted: 2,
      rejected: 0,
      failed: 0
    });

    await renderIngestView();

    fireEvent.click(screen.getByLabelText("Select draft draft-1"));
    fireEvent.click(screen.getByLabelText("Select draft draft-2"));
    fireEvent.click(screen.getByRole("button", { name: "Accept selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm accept selected" }));

    await waitFor(() => {
      expect(apiMock.bulkReviewExtractionDrafts).toHaveBeenCalledWith(LANGUAGE_ID, "accept", ["draft-1", "draft-2"]);
    });
    await screen.findByText("Bulk review finished: 2 accepted, 0 failed.");
    // Initial load + post-review refresh.
    expect(apiMock.fetchExtractionDrafts.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("selects every proposed draft with the select-all control and rejects in bulk", async () => {
    apiMock.bulkReviewExtractionDrafts.mockResolvedValue({
      results: DRAFTS.map((draft) => ({ draftId: draft.id, ok: true })),
      accepted: 0,
      rejected: 3,
      failed: 0
    });

    await renderIngestView();

    fireEvent.click(screen.getByLabelText("Select all proposed drafts"));
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject selected" }));

    await waitFor(() => {
      expect(apiMock.bulkReviewExtractionDrafts).toHaveBeenCalledWith(LANGUAGE_ID, "reject", ["draft-1", "draft-2", "draft-3"]);
    });
    await screen.findByText("Bulk review finished: 3 rejected, 0 failed.");
  });

  it("shows per-item failures when the bulk review partially fails", async () => {
    apiMock.bulkReviewExtractionDrafts.mockResolvedValue({
      results: [
        { draftId: "draft-1", ok: true, committedEntityId: "lex-1" },
        { draftId: "draft-2", ok: false, error: "Extraction draft is already accepted." }
      ],
      accepted: 1,
      rejected: 0,
      failed: 1
    });

    await renderIngestView();

    fireEvent.click(screen.getByLabelText("Select draft draft-1"));
    fireEvent.click(screen.getByLabelText("Select draft draft-2"));
    fireEvent.click(screen.getByRole("button", { name: "Accept selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm accept selected" }));

    await screen.findByText("Bulk review finished: 1 accepted, 1 failed.");
    expect(screen.getByText("draft-2: Extraction draft is already accepted.")).toBeInTheDocument();
  });

  it("disables the bulk action bar while a bulk review is running", async () => {
    let resolveBulk: (value: unknown) => void = () => {};
    apiMock.bulkReviewExtractionDrafts.mockImplementation(
      () => new Promise((resolve) => { resolveBulk = resolve; })
    );

    await renderIngestView();

    fireEvent.click(screen.getByLabelText("Select draft draft-1"));
    fireEvent.click(screen.getByRole("button", { name: "Accept selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm accept selected" }));

    const busyButtons = await screen.findAllByRole("button", { name: "Reviewing selected..." });
    expect(busyButtons).toHaveLength(2);
    for (const button of busyButtons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
    }
    expect(screen.getByLabelText("Select all proposed drafts")).toBeDisabled();
    expect(screen.getByLabelText("Select draft draft-1")).toBeDisabled();

    resolveBulk({ results: [{ draftId: "draft-1", ok: true }], accepted: 1, rejected: 0, failed: 0 });
    await screen.findByText("Bulk review finished: 1 accepted, 0 failed.");
  });

  it("keeps the single-draft accept and reject buttons working", async () => {
    apiMock.acceptExtractionDraft.mockResolvedValue({ draft: { ...DRAFTS[0], status: "accepted" }, entity: {} });
    apiMock.rejectExtractionDraft.mockResolvedValue({ ...DRAFTS[1], status: "rejected" });

    await renderIngestView();

    fireEvent.click(screen.getByRole("button", { name: "Accept draft draft-1" }));
    await waitFor(() => {
      expect(apiMock.acceptExtractionDraft).toHaveBeenCalledWith("draft-1");
    });
    await screen.findByText("Draft accepted: Lexeme committed.");

    fireEvent.click(screen.getByRole("button", { name: "Reject draft draft-2" }));
    await waitFor(() => {
      expect(apiMock.rejectExtractionDraft).toHaveBeenCalledWith("draft-2");
    });
    expect(apiMock.bulkReviewExtractionDrafts).not.toHaveBeenCalled();
  });

  it("localizes expired-session errors from bulk draft review instead of raw API text", async () => {
    apiMock.bulkReviewExtractionDrafts.mockRejectedValue(
      new ApiError("Request failed: /extraction-drafts/bulk-review (401): Unauthorized", { status: 401 })
    );

    await renderIngestView();

    fireEvent.click(screen.getByLabelText("Select draft draft-1"));
    fireEvent.click(screen.getByRole("button", { name: "Accept selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm accept selected" }));

    await screen.findByText(
      "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
    );
    expect(screen.queryByText(/Unauthorized/i)).not.toBeInTheDocument();
  });

  it("localizes expired-session errors from single-draft accept", async () => {
    apiMock.acceptExtractionDraft.mockRejectedValue(
      new ApiError("Request failed: /extraction-drafts/draft-1/accept (401): Unauthorized", { status: 401 })
    );

    await renderIngestView();

    fireEvent.click(screen.getByRole("button", { name: "Accept draft draft-1" }));

    await screen.findByText(
      "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
    );
    expect(screen.queryByText(/Unauthorized/i)).not.toBeInTheDocument();
  });
});
