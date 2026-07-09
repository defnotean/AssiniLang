import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
const NOW = Date.parse("2026-06-10T12:00:00.000Z");

const PROCESSING_SOURCE = {
  id: "src-processing",
  languageId: LANGUAGE_ID,
  kind: "pdf" as const,
  title: "Scanned field notes",
  status: "processing" as const,
  processingHeartbeatAt: "2026-06-10T11:54:00.000Z",
  processingStartedAt: "2026-06-10T11:50:00.000Z",
  createdAt: "2026-06-10T11:45:00.000Z",
  createdBy: "reviewer"
};

const STALE_PROCESSING_SOURCE = {
  ...PROCESSING_SOURCE,
  processingHeartbeatAt: "2026-06-10T11:42:00.000Z"
};

describe("IngestView processing heartbeat age", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
    apiMock.fetchSources.mockResolvedValue([PROCESSING_SOURCE]);
  });

  it("shows a humanized heartbeat age for processing sources", async () => {
    render(<IngestView languageId={LANGUAGE_ID} />);

    expect(await screen.findByText("Last progress 6 min ago")).toBeInTheDocument();
  });

  it("shows a humanized stale warning with the last progress age", async () => {
    apiMock.fetchSources.mockResolvedValue([STALE_PROCESSING_SOURCE]);

    render(<IngestView languageId={LANGUAGE_ID} />);

    expect(await screen.findByText(/Processing has not reported progress since 18 min ago/)).toBeInTheDocument();
    expect(screen.getByText(/It may be stuck/)).toBeInTheDocument();
  });
});
