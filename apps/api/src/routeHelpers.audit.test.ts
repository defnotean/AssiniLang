import { afterEach, describe, expect, it } from "vitest";
import { buildTestWorkspaceState, LOCAL_PROTOTYPE_USERS } from "@assini/db";
import { appendAuditEvent, buildAuditEvent } from "./routeHelpers.js";

const ORIGINAL_ENV = {
  ASSINI_LLM_API_KEY: process.env.ASSINI_LLM_API_KEY,
  ASSINI_TRANSCRIBE_API_KEY: process.env.ASSINI_TRANSCRIBE_API_KEY
};

afterEach(() => {
  process.env.ASSINI_LLM_API_KEY = ORIGINAL_ENV.ASSINI_LLM_API_KEY;
  process.env.ASSINI_TRANSCRIBE_API_KEY = ORIGINAL_ENV.ASSINI_TRANSCRIBE_API_KEY;
});

describe("audit event redaction", () => {
  it("redacts secrets from audit summaries and nested metadata", () => {
    process.env.ASSINI_LLM_API_KEY = "configured-secret";
    process.env.ASSINI_TRANSCRIBE_API_KEY = "transcribe-secret-value";

    const actor = LOCAL_PROTOTYPE_USERS.find((user) => user.id === "admin-1");
    if (!actor) throw new Error("Expected admin prototype user");

    const state = buildTestWorkspaceState();
    const event = buildAuditEvent(
      state,
      {
        actor,
        action: "source_asset.process_failed",
        entityType: "source_asset",
        entityId: "source-1",
        languageId: "testlang",
        summary: "Processing failed with configured-secret",
        metadata: {
          reason: "Bearer clear-token ASSINI_TRANSCRIBE_API_KEY=xyz",
          nested: { detail: "retry with transcribe-secret-value" }
        }
      },
      0
    );

    expect(event.summary).toBe("Processing failed with [redacted-secret]");
    expect(event.metadata).toEqual({
      reason: "[redacted-secret] [redacted-secret]",
      nested: { detail: "retry with [redacted-secret]" }
    });

    const next = appendAuditEvent(state, {
      actor,
      action: "source_asset.process_failed",
      entityType: "source_asset",
      entityId: "source-1",
      summary: "failed with sk-live-value",
      metadata: { reason: "configured-secret" }
    });

    const appended = next.auditEvents.at(-1);
    expect(appended?.summary).toBe("failed with [redacted-secret]");
    expect(appended?.metadata).toEqual({ reason: "[redacted-secret]" });
  });
});
