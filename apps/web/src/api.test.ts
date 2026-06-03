import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDashboardData, reviewNote, submitExerciseAnswer } from "./api";

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

  it("patches encoded note review payloads", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "note/1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await reviewNote("note/1", {
      status: "approved",
      reviewerComment: "Approved in local prototype."
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/notes/note%2F1/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "approved",
        reviewerComment: "Approved in local prototype."
      })
    });
  });

  it("posts encoded exercise submissions", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ accepted: true })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await submitExerciseAnswer("exercise/1", "mira talo-mi-na");

    expect(fetchMock).toHaveBeenCalledWith("/api/exercises/exercise%2F1/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "mira talo-mi-na" })
    });
  });
});
