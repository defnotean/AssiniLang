import { describe, expect, it } from "vitest";
import {
  hasReasoningOnlyContent,
  parseAssistantMessageContent,
  parseOpenAiChatCompletionContent
} from "./llmResponseParsing.js";

describe("llm response parsing", () => {
  it("trims string assistant content", () => {
    expect(parseAssistantMessageContent("  Visible response \n")).toBe("Visible response");
    expect(
      parseOpenAiChatCompletionContent(
        {
          choices: [{ message: { content: "  Visible response \n" } }]
        },
        "empty fallback"
      )
    ).toEqual({
      ok: true,
      content: "Visible response"
    });
  });

  it("joins text parts from array-shaped assistant content", () => {
    const content = [
      { type: "text", text: "First " },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      { type: "text", text: "second" },
      null,
      { type: "text", text: 42 }
    ];

    expect(parseAssistantMessageContent(content)).toBe("First second");
    expect(
      parseOpenAiChatCompletionContent(
        {
          choices: [{ message: { content } }]
        },
        "empty fallback"
      )
    ).toEqual({
      ok: true,
      content: "First second"
    });
  });

  it("treats thinking-only placeholders as empty assistant content", () => {
    expect(parseAssistantMessageContent(" [THINK] ")).toBeUndefined();
    expect(parseAssistantMessageContent([{ type: "text", text: "[think]" }])).toBeUndefined();
  });

  it("detects reasoning-only assistant messages without exposing reasoning content", () => {
    const message = {
      content: "",
      reasoning_content: "private internal reasoning"
    };

    expect(hasReasoningOnlyContent(message)).toBe(true);
    expect(
      parseOpenAiChatCompletionContent(
        {
          choices: [{ message }]
        },
        "empty fallback"
      )
    ).toEqual({
      ok: false,
      error:
        "LLM provider returned only reasoning_content without visible assistant content. Increase max tokens or choose a model that emits final content."
    });
  });

  it("uses the caller-provided empty content fallback", () => {
    expect(
      parseOpenAiChatCompletionContent(
        {
          choices: [{ message: { content: " " } }]
        },
        "empty fallback"
      )
    ).toEqual({
      ok: false,
      error: "empty fallback"
    });
  });
});
