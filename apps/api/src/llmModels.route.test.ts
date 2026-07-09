import { buildTestWorkspaceState } from "@assini/db";
import { describe, expect, it } from "vitest";
import { MAX_EXTRA_DISCOVERY_BASE_URLS } from "./llmDiscovery.js";
import { createServer } from "./server.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("GET /llm/models discovery inputs", () => {
  it("returns 400 when too many base URL query values are requested", async () => {
    let fetchCalls = 0;
    const query = new URLSearchParams({ includeCommonTargets: "false" });
    for (let index = 0; index <= MAX_EXTRA_DISCOVERY_BASE_URLS; index += 1) {
      query.append("baseUrl", "https://models.example/v1");
    }
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      ingestionFetch: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/llm/models?${query.toString()}`,
        headers: authHeaders("programmer-1")
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: `Too many model discovery base URLs: at most ${MAX_EXTRA_DISCOVERY_BASE_URLS} per request.`
      });
      expect(fetchCalls).toBe(0);
    } finally {
      await app.close();
    }
  });
});
