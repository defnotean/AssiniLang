import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./lib/apiClient";
import { IngestView } from "./views/IngestView";

const apiMock = vi.hoisted(() => ({
  acceptExtractionDraft: vi.fn(),
  bulkReviewExtractionDrafts: vi.fn(),
  cancelSourceProcessing: vi.fn(),
  fetchExtractionDrafts: vi.fn(),
  fetchSources: vi.fn(),
  processSource: vi.fn(),
  registerSource: vi.fn(),
  rejectExtractionDraft: vi.fn(),
  uploadSourceFile: vi.fn()
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    ...apiMock
  };
});

const LANGUAGE_ID = "avenik";

const QUEUED_SOURCE = {
  id: "src-queued",
  languageId: LANGUAGE_ID,
  kind: "text" as const,
  title: "Queued source",
  status: "processing" as const,
  processingQueuePhase: "queued" as const,
  processingAttempts: 1,
  processingStartedAt: "2026-06-10T11:50:00.000Z",
  processingHeartbeatAt: "2026-06-10T11:50:00.000Z",
  createdAt: "2026-06-10T00:00:00.000Z",
  createdBy: "reviewer"
};

const ACTIVE_SOURCE = {
  id: "src-active",
  languageId: LANGUAGE_ID,
  kind: "text" as const,
  title: "Active source",
  status: "processing" as const,
  processingQueuePhase: "active" as const,
  processingAttempts: 1,
  processingStartedAt: "2026-06-10T11:50:00.000Z",
  processingHeartbeatAt: "2026-06-10T11:55:00.000Z",
  createdAt: "2026-06-10T00:00:00.000Z",
  createdBy: "reviewer"
};

const FAILED_SOURCE = {
  id: "src-failed",
  languageId: LANGUAGE_ID,
  kind: "text" as const,
  title: "Failed source",
  status: "failed" as const,
  processingAttempts: 2,
  error: "Queued source processing was cancelled. Use Retry when ready.",
  createdAt: "2026-06-10T00:00:00.000Z",
  createdBy: "reviewer"
};

const MAXED_SOURCE = {
  id: "src-maxed",
  languageId: LANGUAGE_ID,
  kind: "text" as const,
  title: "Capped source",
  status: "failed" as const,
  processingAttempts: 5,
  error: "Source processing failed.",
  createdAt: "2026-06-10T00:00:00.000Z",
  createdBy: "reviewer"
};

describe("IngestView cancel queued processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
  });

  it("shows queued vs processing vs capped status, Attempt N/5, Cancel only when queued, and Retry after cancel", async () => {
    apiMock.fetchSources.mockResolvedValue([QUEUED_SOURCE, ACTIVE_SOURCE, FAILED_SOURCE, MAXED_SOURCE]);
    apiMock.cancelSourceProcessing.mockResolvedValue({
      asset: {
        ...QUEUED_SOURCE,
        status: "failed",
        processingQueuePhase: undefined,
        error: "Queued source processing was cancelled. Use Retry when ready.",
        processingStartedAt: undefined,
        processingHeartbeatAt: undefined
      }
    });

    render(<IngestView languageId={LANGUAGE_ID} />);

    expect(await screen.findAllByText("Attempt 1/5")).toHaveLength(2);
    expect(screen.getByText("Attempt 2/5")).toBeInTheDocument();
    expect(screen.getByText("Attempt 5/5")).toBeInTheDocument();

    expect(screen.getByText("queued")).toBeInTheDocument();
    // Active queue phase badge (button labels also contain "processing" while busy).
    expect(screen.getByText("processing", { selector: ".status-badge.processing" })).toBeInTheDocument();
    expect(screen.getByText("attempt cap reached")).toBeInTheDocument();
    expect(screen.getByText(/This source reached the 5-attempt cap/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Cancel Queued source" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Active source" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Failed source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Capped source" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel Queued source" }));

    await waitFor(() => {
      expect(apiMock.cancelSourceProcessing).toHaveBeenCalledWith("src-queued");
    });

    expect(
      await screen.findByText("Cancelled queued processing for Queued source. Use Retry when ready.")
    ).toBeInTheDocument();
    // Appears on both the originally failed source and the newly cancelled one.
    expect(screen.getAllByText("Queued processing was cancelled. Use Retry when ready.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Retry Queued source" })).toBeInTheDocument();
  });

  it("surfaces the localized active-cancel 409 message", async () => {
    apiMock.fetchSources.mockResolvedValue([QUEUED_SOURCE]);
    apiMock.cancelSourceProcessing.mockRejectedValue(
      new ApiError("Source processing is already running and cannot be cancelled.", {
        status: 409,
        i18nKey: "ingest.sourceProcessingCancelActive"
      })
    );

    render(<IngestView languageId={LANGUAGE_ID} />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel Queued source" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Processing has already started and cannot be cancelled. Wait for it to finish, or recover a stuck job after restart."
    );
  });
});
