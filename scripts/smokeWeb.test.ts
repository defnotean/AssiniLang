import { describe, expect, it } from "vitest";
import { parseSmokeReport, smokeUrl } from "./lib/smokeWebChecks.cjs";

describe("web renderer smoke gate", () => {
  it("requires a populated app shell and no renderer failures", () => {
    expect(() =>
      parseSmokeReport({
        bodyTextLength: 120,
        consoleErrors: [],
        fatalEvents: [],
        headingCount: 2,
        rootChildCount: 1
      })
    ).not.toThrow();
  });

  it("rejects an empty or fatally errored render", () => {
    expect(() =>
      parseSmokeReport({
        bodyTextLength: 0,
        consoleErrors: [],
        fatalEvents: [],
        headingCount: 0,
        rootChildCount: 0
      })
    ).toThrow("too little visible text");
    expect(() =>
      parseSmokeReport({
        bodyTextLength: 120,
        consoleErrors: [],
        fatalEvents: [{ errorCode: -2 }],
        headingCount: 1,
        rootChildCount: 1
      })
    ).toThrow("fatal events");
  });

  it("supports an explicit URL for an already running dev server", () => {
    const previous = process.env.ASSINI_WEB_SMOKE_URL;
    process.env.ASSINI_WEB_SMOKE_URL = "http://127.0.0.1:5199";
    expect(smokeUrl()).toBe("http://127.0.0.1:5199");
    if (previous === undefined) delete process.env.ASSINI_WEB_SMOKE_URL;
    else process.env.ASSINI_WEB_SMOKE_URL = previous;
  });
});
