import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDashboardData } from "./api";

describe("fetchDashboardData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes language ids before building language routes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchDashboardData("avenik/test language");

    expect(fetchMock).toHaveBeenCalledWith("/api/languages/avenik%2Ftest%20language/corpus");
    expect(fetchMock).toHaveBeenCalledWith("/api/languages/avenik%2Ftest%20language/notes");
    expect(fetchMock).toHaveBeenCalledWith("/api/languages/avenik%2Ftest%20language/exercises");
  });
});
