import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../i18n";
import { INGEST_POLL_INTERVAL_MS, INGEST_POLL_MAX_DURATION_MS, useIngestExtraction } from "./useIngestExtraction";

const apiMock = vi.hoisted(() => ({
  acceptExtractionDraft: vi.fn(),
  bulkReviewExtractionDrafts: vi.fn(),
  cancelSourceProcessing: vi.fn(),
  fetchExtractionDrafts: vi.fn(),
  fetchSources: vi.fn(),
  importObsidianVault: vi.fn(),
  processSource: vi.fn(),
  registerSource: vi.fn(),
  rejectExtractionDraft: vi.fn(),
  uploadSourceFile: vi.fn()
}));

vi.mock("../api", () => apiMock);

const LANGUAGE_ID = "avenik";
const PROCESSING_SOURCE = {
  id: "src-1",
  languageId: LANGUAGE_ID,
  kind: "text" as const,
  title: "Field notebook page",
  status: "processing" as const,
  createdAt: "2026-06-10T00:00:00.000Z",
  createdBy: "reviewer"
};

async function flushHook() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useIngestExtraction polling", () => {
  const t = createTranslator("en");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00.000Z"));
    vi.clearAllMocks();
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
    apiMock.fetchSources.mockResolvedValue([{ ...PROCESSING_SOURCE, status: "pending" }]);
    apiMock.processSource.mockResolvedValue({
      asset: PROCESSING_SOURCE,
      drafts: [],
      warnings: []
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops polling and surfaces a timeout error after the max duration", async () => {
    apiMock.fetchSources
      .mockResolvedValueOnce([{ ...PROCESSING_SOURCE, status: "pending" }])
      .mockResolvedValue([PROCESSING_SOURCE]);

    const { result } = renderHook(() => useIngestExtraction(LANGUAGE_ID, t));
    await flushHook();
    expect(result.current.isLoadingIntake).toBe(false);

    await act(async () => {
      await result.current.handleProcessSource("src-1");
    });
    expect(result.current.processingSourceId).toBe("src-1");

    await act(async () => {
      vi.advanceTimersByTime(INGEST_POLL_MAX_DURATION_MS - INGEST_POLL_INTERVAL_MS);
      await flushHook();
    });
    expect(result.current.processingSourceId).toBe("src-1");

    await act(async () => {
      vi.advanceTimersByTime(INGEST_POLL_INTERVAL_MS * 2);
      await flushHook();
    });

    expect(result.current.processingSourceId).toBeNull();
    expect(result.current.processError).toBe(
      'Processing is taking too long for "Field notebook page". Restart the API if it is stuck, then try again.'
    );
  });

  it("stops retrying fetch errors after the max duration", async () => {
    apiMock.fetchSources
      .mockResolvedValueOnce([{ ...PROCESSING_SOURCE, status: "pending" }])
      .mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useIngestExtraction(LANGUAGE_ID, t));
    await flushHook();
    expect(result.current.isLoadingIntake).toBe(false);

    await act(async () => {
      await result.current.handleProcessSource("src-1");
    });

    const callsBeforeTimeout = apiMock.fetchSources.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(INGEST_POLL_MAX_DURATION_MS + INGEST_POLL_INTERVAL_MS);
      await flushHook();
    });

    expect(result.current.processingSourceId).toBeNull();
    expect(result.current.processError).toContain("Field notebook page");
    expect(apiMock.fetchSources.mock.calls.length).toBeGreaterThan(callsBeforeTimeout);
    expect(apiMock.fetchSources.mock.calls.length).toBeLessThan(300);
  });

  it("does not let an older poll overwrite a successful cancellation", async () => {
    const pendingPoll = deferred<(typeof PROCESSING_SOURCE)[]>();
    const cancelledSource = {
      ...PROCESSING_SOURCE,
      status: "failed" as const,
      error: "Queued source processing was cancelled. Use Retry when ready."
    };
    apiMock.fetchSources.mockResolvedValueOnce([PROCESSING_SOURCE]).mockReturnValueOnce(pendingPoll.promise);
    apiMock.cancelSourceProcessing.mockResolvedValue({ asset: cancelledSource });

    const { result } = renderHook(() => useIngestExtraction(LANGUAGE_ID, t));
    await flushHook();

    expect(result.current.processingSourceId).toBe("src-1");
    expect(apiMock.fetchSources).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.handleCancelProcessing("src-1");
      pendingPoll.resolve([PROCESSING_SOURCE]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.sources).toEqual([cancelledSource]);
    expect(result.current.processingSourceId).toBeNull();
    expect(result.current.processNotice).toContain("Field notebook page");
  });
});
