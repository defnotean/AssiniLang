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

  it("treats empty or whitespace-only cookie values as absent", () => {
    expect(
      cookieValue(requestWithCookie("assini_prototype_session=; other=ok"), "assini_prototype_session")
    ).toBeUndefined();
    expect(
      cookieValue(requestWithCookie("assini_prototype_session=%20%20"), "assini_prototype_session")
    ).toBeUndefined();
    expect(
      cookieValue(requestWithCookie("assini_prototype_session="), "assini_prototype_session")
    ).toBeUndefined();
  });

  it("prefers the last matching cookie when the header lists the same name twice", () => {
    expect(
      cookieValue(
        requestWithCookie("assini_prototype_session=stale-session; other=1; assini_prototype_session=session-id-2"),
        "assini_prototype_session"
      )
    ).toBe("session-id-2");
    expect(
      cookieValue(
        requestWithCookie("assini_prototype_session=stale-session; assini_prototype_session="),
        "assini_prototype_session"
      )
    ).toBeUndefined();
    expect(
      cookieValue(
        requestWithCookie("assini_prototype_session=; assini_prototype_session=session%2Did%2D3"),
        "assini_prototype_session"
      )
    ).toBe("session-id-3");
  });
});
