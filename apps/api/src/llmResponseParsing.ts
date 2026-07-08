export type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
    };
  }>;
};

export type OpenAiChatCompletionMessage = NonNullable<NonNullable<OpenAiChatCompletionResponse["choices"]>[number]["message"]>;

export type OpenAiAssistantContentResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

const THINKING_ONLY_PATTERN = /^\[(?:think|THINK)\]$/i;
const REASONING_ONLY_MESSAGE = "LLM provider returned only reasoning_content without visible assistant content. Increase max tokens or choose a model that emits final content.";

export function parseAssistantMessageContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed.length === 0 || THINKING_ONLY_PATTERN.test(trimmed)) return undefined;
    return trimmed;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as { type?: unknown; text?: unknown };
        return record.type === "text" && typeof record.text === "string" ? record.text : "";
      })
      .join("")
      .trim();
    if (text.length === 0 || THINKING_ONLY_PATTERN.test(text)) return undefined;
    return text;
  }

  return undefined;
}

export function hasReasoningOnlyContent(message: OpenAiChatCompletionMessage | undefined): boolean {
  if (!message) return false;
  return parseAssistantMessageContent(message.content) === undefined
    && typeof message.reasoning_content === "string"
    && message.reasoning_content.trim().length > 0;
}

export function parseOpenAiChatCompletionContent(
  payload: OpenAiChatCompletionResponse,
  emptyContentMessage: string
): OpenAiAssistantContentResult {
  const message = payload.choices?.[0]?.message;
  const content = parseAssistantMessageContent(message?.content);
  if (content) return { ok: true, content };
  return {
    ok: false,
    error: hasReasoningOnlyContent(message)
      ? REASONING_ONLY_MESSAGE
      : emptyContentMessage
  };
}
