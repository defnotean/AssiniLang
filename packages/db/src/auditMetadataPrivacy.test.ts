import { describe, expect, it } from "vitest";
import { auditMetadataPrivacyIssue } from "./auditMetadataPrivacy.js";

describe("auditMetadataPrivacyIssue", () => {
  it("reports private audit metadata keys using the original field name", () => {
    expect(
      auditMetadataPrivacyIssue({
        action: "exercise_submission.created",
        learnerAnswer: "mira talo-mi-na"
      })
    ).toBe("private field: learnerAnswer");

    expect(
      auditMetadataPrivacyIssue({
        nested: {
          "api-key": "local-test-key"
        }
      })
    ).toBe("private field: api-key");
  });

  it("reports secret-looking string values at the metadata path", () => {
    expect(auditMetadataPrivacyIssue("OPENAI_API_KEY=local-test-key")).toBe("secret-like value at metadata");

    expect(
      auditMetadataPrivacyIssue({
        diagnostic: ["safe line", "bearer local-test-token"]
      })
    ).toBe("secret-like value at diagnostic.1");
  });

  it("blocks common credential field names and transcription key patterns", () => {
    expect(auditMetadataPrivacyIssue({ password: "x" })).toBe("private field: password");
    expect(auditMetadataPrivacyIssue({ refreshToken: "x" })).toBe("private field: refreshToken");
    expect(auditMetadataPrivacyIssue({ client_secret: "x" })).toBe("private field: client_secret");
    expect(auditMetadataPrivacyIssue({ privateKey: "x" })).toBe("private field: privateKey");
    expect(auditMetadataPrivacyIssue("ASSINI_TRANSCRIBE_API_KEY=local-transcribe-key")).toBe(
      "secret-like value at metadata"
    );
    expect(auditMetadataPrivacyIssue("ASSINI_OCR_API_KEY=local-ocr-key")).toBe("secret-like value at metadata");
  });
});
