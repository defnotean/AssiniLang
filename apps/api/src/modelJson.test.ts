import { describe, expect, it } from "vitest";
import { parseModelJson } from "./modelJson.js";

describe("parseModelJson", () => {
  it("parses a plain JSON object", () => {
    const result = parseModelJson('{"summary":"ok","count":2}');

    expect(result).toEqual({ summary: "ok", count: 2 });
  });

  it("parses a fenced JSON object", () => {
    const result = parseModelJson(
      [
        "```json",
        "{\"summary\":\"from fence\",\"count\":3}",
        "```"
      ].join("\n")
    );

    expect(result).toEqual({ summary: "from fence", count: 3 });
  });

  it("extracts the first JSON object from surrounding prose", () => {
    const result = parseModelJson(
      'Here is the result: {"summary":"from prose","count":4} Thanks.'
    );

    expect(result).toEqual({ summary: "from prose", count: 4 });
  });

  it("handles nested objects and braces inside strings", () => {
    const result = parseModelJson(
      'prefix {"summary":"literal { brace } text","meta":{"count":5}} suffix'
    );

    expect(result).toEqual({
      summary: "literal { brace } text",
      meta: { count: 5 }
    });
  });

  it("returns undefined when no valid JSON object can be parsed", () => {
    expect(parseModelJson("I could not produce JSON.")).toBeUndefined();
    expect(parseModelJson('{"summary":"unterminated"')).toBeUndefined();
  });
});
