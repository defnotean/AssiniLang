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

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    ...apiMock
  };
});

const LANGUAGE_ID = "avenik";

const PENDING_SOURCE = {
  id: "src-busy",
  languageId: LANGUAGE_ID,
  kind: "text" as const,
  title: "Busy source",
  status: "pending" as const,
  createdAt: "2026-06-10T00:00:00.000Z",
  createdBy: "reviewer"
};

describe("IngestView already-processing conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
    apiMock.fetchSources.mockResolvedValue([PENDING_SOURCE]);
  });

  it("surfaces the localized already-processing 409 message", async () => {
    apiMock.processSource.mockRejectedValue(
      new ApiError("Source is already processing: src-busy", {
        status: 409,
        i18nKey: "ingest.sourceAlreadyProcessing"
      })
    );

    render(<IngestView languageId={LANGUAGE_ID} />);

    fireEvent.click(await screen.findByRole("button", { name: "Process Busy source" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This source is already processing. Wait for the current run to finish, or recover a stuck job after restart."
    );
  });

  it("localizes intake load failures instead of raw API text", async () => {
    apiMock.fetchSources.mockRejectedValue(
      new ApiError("Request failed: /languages/avenik/sources (401): Unauthorized", { status: 401 })
    );

    render(<IngestView languageId={LANGUAGE_ID} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
      );
    });
  });

  it("localizes source registration failures", async () => {
    apiMock.registerSource.mockRejectedValue(
      new ApiError("Request failed: /languages/avenik/sources (429): Rate limit exceeded Retry after 12 seconds.", {
        status: 429
      })
    );

    render(<IngestView languageId={LANGUAGE_ID} />);

    fireEvent.change(await screen.findByLabelText("Source title"), {
      target: { value: "Field notes" }
    });
    fireEvent.change(screen.getByLabelText("Raw text"), {
      target: { value: "mira = river" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Register source" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Wait 12 seconds, then retry."
    );
  });
});
