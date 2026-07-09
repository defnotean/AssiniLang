import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
const MAX_ATTEMPTS = 5;

const MAXED_SOURCE = {
  id: "src-maxed",
  languageId: LANGUAGE_ID,
  kind: "text" as const,
  title: "Over-processed source",
  status: "failed" as const,
  processingAttempts: MAX_ATTEMPTS,
  createdAt: "2026-06-10T00:00:00.000Z",
  createdBy: "reviewer"
};

describe("IngestView max processing attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
    apiMock.fetchSources.mockResolvedValue([MAXED_SOURCE]);
    apiMock.processSource.mockRejectedValue(
      new ApiError(`Source processing attempt limit reached (${MAX_ATTEMPTS}).`, {
        status: 409,
        i18nKey: "ingest.sourceMaxProcessingAttempts",
        i18nParams: { max: MAX_ATTEMPTS, count: MAX_ATTEMPTS }
      })
    );
  });

  it("surfaces the localized max-attempt 409 message in the UI", async () => {
    render(<IngestView languageId={LANGUAGE_ID} />);

    const retryButton = await screen.findByRole("button", { name: "Retry Over-processed source" });
    expect(retryButton).toBeDisabled();
  });

  it("keeps Retry enabled under the attempt cap and surfaces a 409 from process", async () => {
    apiMock.fetchSources.mockResolvedValue([
      {
        ...MAXED_SOURCE,
        id: "src-retryable",
        title: "Retryable source",
        processingAttempts: MAX_ATTEMPTS - 1
      }
    ]);

    render(<IngestView languageId={LANGUAGE_ID} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry Retryable source" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Processing stopped after ${MAX_ATTEMPTS} attempts. Review the source error or contact an operator.`
    );
  });
});
