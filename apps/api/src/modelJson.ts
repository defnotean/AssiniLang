function stripCodeFences(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1] ?? content;
}

function jsonObjectEnd(content: string, start: number): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return undefined;
}

export function parseModelJson(content: string): unknown | undefined {
  const normalized = stripCodeFences(content);
  let searchFrom = 0;

  // A model may mention a non-JSON brace expression before its final answer.
  // Try balanced object candidates in source order instead of rejecting the
  // entire response when only the first brace-delimited fragment is invalid.
  // The attempt limit bounds work for adversarial brace-heavy responses.
  for (let attempts = 0; attempts < 256; attempts += 1) {
    const start = normalized.indexOf("{", searchFrom);
    if (start < 0) return undefined;
    const end = jsonObjectEnd(normalized, start);
    if (end !== undefined) {
      try {
        return JSON.parse(normalized.slice(start, end));
      } catch {
        // A later object can still be the model's structured final answer.
      }
    }
    searchFrom = start + 1;
  }

  return undefined;
}
