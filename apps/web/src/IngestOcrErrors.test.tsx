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
        "The PDF contains no extractable text — it may be a scanned image. Configure ASSINI_OCR_BASE_URL with a vision-capable OCR model to read scanned PDFs."
      )
    ]);

    render(<IngestView languageId="avenik" />);

    expect(
      await screen.findByText(
        "This document needs OCR. Set an OCR base URL in Runtime settings (Model tab), then process again."
      )
    ).toBeInTheDocument();
  });

  it("shows a localized DOCX OCR-unsupported hint on failed document sources", async () => {
    apiMock.fetchSources.mockResolvedValue([
      failedDocumentSource(
        "The document contains no extractable text — it may be a scanned image; OCR is not supported yet."
      )
    ]);

    render(<IngestView languageId="avenik" />);

    expect(
      await screen.findByText(
        "This document has no extractable text, and DOCX OCR is not supported yet. Export pages as images or paste the text, then process again."
      )
    ).toBeInTheDocument();
  });
});

describe("IngestView multi-page OCR warnings", () => {
  it("shows localized multi-page PDF OCR warnings on processed sources", async () => {
    apiMock.fetchSources.mockResolvedValue([
      {
        id: "asset-scan-multi",
        languageId: "avenik",
        kind: "document",
        title: "Multi-page field notes",
        status: "processed",
        createdBy: "reviewer-1",
        createdAt: "2026-06-11T00:00:00.000Z",
        processedAt: "2026-06-11T00:05:00.000Z",
        processingAttempts: 1,
        warnings: [
          "Used configured OCR model to read scanned document (2 of 2 pages).",
          "PDF has 14 pages; only the first 10 pages were OCR'd. Raise ASSINI_OCR_PDF_MAX_PAGES or split remaining pages into separate sources if you need them.",
          "OCR failed for page 2; continuing with remaining pages."
        ]
      }
    ]);

    render(<IngestView languageId="avenik" />);

    const warnings = await screen.findByRole("list", {
      name: "Processing warnings for Multi-page field notes"
    });
    expect(warnings).toHaveTextContent(
      "Used configured OCR model to read scanned document (2 of 2 pages)."
    );
    expect(warnings).toHaveTextContent(
      "PDF has 14 pages; only the first 10 pages were OCR'd. Raise the OCR page cap or split remaining pages into separate sources if you need them."
    );
    expect(warnings).toHaveTextContent(
      "OCR failed for page 2; continuing with remaining pages."
    );
  });
});
