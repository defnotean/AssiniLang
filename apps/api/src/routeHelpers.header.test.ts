import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { cookieValue, getHeaderValue } from "./routeHelpers.js";

function requestWithHeaders(headers: Record<string, string | string[] | undefined>): FastifyRequest {
  return { headers } as FastifyRequest;
}

describe("getHeaderValue", () => {
  it("returns a string header as-is", () => {
    expect(getHeaderValue(requestWithHeaders({ "x-assini-user-id": "learner-1" }), "x-assini-user-id")).toBe(
      "learner-1"
    );
  });

  it("joins repeated Cookie header values so session pairs are not dropped", () => {
    expect(
      getHeaderValue(
        requestWithHeaders({
          cookie: ["assini_prototype_session=session-id-1", "other=1"]
        }),
        "cookie"
      )
    ).toBe("assini_prototype_session=session-id-1; other=1");
  });

  it("prefers the last non-empty value for non-cookie auth headers", () => {
    expect(
      getHeaderValue(
        requestWithHeaders({
          "x-assini-dev-token": ["stale-token", "fresh-token"]
        }),
        "x-assini-dev-token"
      )
    ).toBe("fresh-token");
    expect(
      getHeaderValue(
        requestWithHeaders({
          authorization: ["Bearer stale", "Bearer fresh"]
        }),
        "authorization"
      )
    ).toBe("Bearer fresh");
  });

  it("returns undefined for empty arrays or missing headers", () => {
    expect(getHeaderValue(requestWithHeaders({ cookie: [] }), "cookie")).toBeUndefined();
    expect(getHeaderValue(requestWithHeaders({}), "cookie")).toBeUndefined();
  });
});

describe("cookieValue with array Cookie headers", () => {
  it("reads a session id when Cookie arrives as a string array", () => {
    expect(
      cookieValue(
        requestWithHeaders({
          cookie: ["assini_prototype_session=session-id-1", "theme=dark"]
        }),
        "assini_prototype_session"
      )
    ).toBe("session-id-1");
  });

  it("still prefers the last matching pair across joined Cookie array parts", () => {
    expect(
      cookieValue(
        requestWithHeaders({
          cookie: ["assini_prototype_session=stale-session", "assini_prototype_session=session-id-2"]
        }),
        "assini_prototype_session"
      )
    ).toBe("session-id-2");
  });
});
