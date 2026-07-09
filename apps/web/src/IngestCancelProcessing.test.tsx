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
  processingAttempts: 1,
  processingStartedAt: "2026-06-10T11:50:00.000Z",
  processingHeartbeatAt: "2026-06-10T11:50:00.000Z",
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
  error: "Queued source processing was cancelled. Re-run processing when ready.",
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

  it("shows Cancel for processing sources and Retry with attempt count for failed under the cap", async () => {
    apiMock.fetchSources.mockResolvedValue([QUEUED_SOURCE, FAILED_SOURCE, MAXED_SOURCE]);
    apiMock.cancelSourceProcessing.mockResolvedValue({
      asset: {
        ...QUEUED_SOURCE,
        status: "failed",
        error: "Queued source processing was cancelled. Re-run processing when ready.",
        processingStartedAt: undefined,
        processingHeartbeatAt: undefined
      }
    });

    render(<IngestView languageId={LANGUAGE_ID} />);

    expect(await screen.findByText("Attempt 1")).toBeInTheDocument();
    expect(screen.getByText("Attempt 2")).toBeInTheDocument();
    expect(screen.getByText("Attempt 5")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Cancel Queued source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Failed source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Capped source" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel Queued source" }));

    await waitFor(() => {
      expect(apiMock.cancelSourceProcessing).toHaveBeenCalledWith("src-queued");
    });

    expect(
      await screen.findByText("Cancelled queued processing for Queued source.")
    ).toBeInTheDocument();
    // Appears on both the originally failed source and the newly cancelled one.
    expect(
      screen.getAllByText("Queued processing was cancelled. Re-run processing when ready.")
    ).toHaveLength(2);
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
