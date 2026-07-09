import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceAsset } from "./api";
import { IngestView } from "./views/IngestView";

const apiMock = vi.hoisted(() => ({
  fetchExtractionDrafts: vi.fn(),
  fetchSources: vi.fn(),
  processSource: vi.fn(),
  registerSource: vi.fn(),
  rejectExtractionDraft: vi.fn(),
  acceptExtractionDraft: vi.fn(),
  bulkReviewExtractionDrafts: vi.fn(),
  uploadSourceFile: vi.fn()
}));

vi.mock("./api", () => apiMock);

function failedDocumentSource(error: string): SourceAsset {
  return {
    id: "asset-scan-1",
    languageId: "avenik",
    kind: "document",
    title: "Scanned field notes",
    status: "failed",
    createdBy: "reviewer-1",
    createdAt: "2026-06-11T00:00:00.000Z",
    error,
    processingAttempts: 1
  };
}

beforeEach(() => {
  apiMock.fetchExtractionDrafts.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("IngestView OCR processing errors", () => {
  it("shows a localized OCR setup hint on failed document sources", async () => {
    apiMock.fetchSources.mockResolvedValue([
      failedDocumentSource(
        "The PDF contains no extractable text — it may be a scanned image. Configure ASSINI_OCR_BASE_URL with a vision-capable OCR model to read scanned PDFs (page 1 only)."
      )
    ]);

    render(<IngestView languageId="avenik" />);

    expect(
      await screen.findByText(
        "This document needs OCR. Set an OCR base URL in Runtime settings (Model tab), then process again."
      )
    ).toBeInTheDocument();
  });
});
