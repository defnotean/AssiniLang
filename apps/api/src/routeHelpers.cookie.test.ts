import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { cookieValue } from "./routeHelpers.js";

function requestWithCookie(cookie: string | undefined): FastifyRequest {
  return {
    headers: cookie === undefined ? {} : { cookie }
  } as FastifyRequest;
}

describe("cookieValue", () => {
  it("returns undefined when the cookie header is missing", () => {
    expect(cookieValue(requestWithCookie(undefined), "assini_prototype_session")).toBeUndefined();
  });

  it("decodes a valid percent-encoded session cookie", () => {
    expect(
      cookieValue(
        requestWithCookie("assini_prototype_session=session%2Did%2D1; other=1"),
        "assini_prototype_session"
      )
    ).toBe("session-id-1");
  });

  it("treats malformed percent-encoding as an absent cookie instead of throwing", () => {
    expect(() =>
      cookieValue(
        requestWithCookie("assini_prototype_session=%E0%A4%A; other=ok"),
        "assini_prototype_session"
      )
    ).not.toThrow();
    expect(
      cookieValue(
        requestWithCookie("assini_prototype_session=%E0%A4%A"),
        "assini_prototype_session"
      )
    ).toBeUndefined();
  });
});
