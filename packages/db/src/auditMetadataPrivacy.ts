const privateAuditMetadataKeys = new Set([
  "answer",
  "answers",
  "learneranswer",
  "learneranswers",
  "expectedanswer",
  "expectedanswers",
  "adversarialanswer",
  "adversarialanswers",
  "answerkey",
  "answerkeys",
  "gradingexplanation",
  "providerprompt",
  "hiddenchainofthought",
  "chainofthought",
  "apikey",
  "authorization",
  "bearer",
  "secret",
  "token",
  "password",
  "passwd",
  "privatekey",
  "refreshtoken",
  "clientsecret",
  "accesstoken",
  "sessiontoken"
]);

const secretLikeAuditMetadataValuePattern =
  /\b(?:bearer\s+\S+|sk-[A-Za-z0-9._-]+|(?:ASSINI_LLM_API_KEY|OPENAI_API_KEY|ASSINI_TRANSCRIBE_API_KEY|ASSINI_OCR_API_KEY)\s*=|api[_-]?key\s*[:=]|secret\s*[:=]|password\s*[:=]|refresh[_-]?token\s*[:=]|client[_-]?secret\s*[:=])/i;

function normalizeAuditMetadataKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function auditMetadataPath(path: string[]): string {
  return path.length > 0 ? path.join(".") : "metadata";
}

export function auditMetadataPrivacyIssue(value: unknown, path: string[] = []): string | undefined {
  if (typeof value === "string" && secretLikeAuditMetadataValuePattern.test(value)) {
    return `secret-like value at ${auditMetadataPath(path)}`;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = auditMetadataPrivacyIssue(value[index], [...path, String(index)]);
      if (issue) return issue;
    }
    return undefined;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (privateAuditMetadataKeys.has(normalizeAuditMetadataKey(key))) {
        return `private field: ${key}`;
      }

      const issue = auditMetadataPrivacyIssue(nestedValue, [...path, key]);
      if (issue) return issue;
    }
  }

  return undefined;
}
