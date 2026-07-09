import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n";
import {
  REVIEWER_COMMENT_KEYS,
  REVIEWER_EDITED_EXPLANATION_COMMENT_KEY
} from "./viewConfig";
import type { ReviewStatus } from "./types";

const STATUSES: ReviewStatus[] = ["approved", "contested", "rejected", "deferred", "escalated"];

describe("reviewer comment i18n", () => {
  it("maps every review status to a localized English comment", () => {
    const t = createTranslator("en");
    for (const status of STATUSES) {
      expect(t(REVIEWER_COMMENT_KEYS[status])).toMatch(/local prototype\./);
    }
    expect(t(REVIEWER_EDITED_EXPLANATION_COMMENT_KEY)).toBe(
      "Edited note explanation in local prototype."
    );
  });

  it("uses Arabic copy for persisted reviewer comments when locale is ar", () => {
    const t = createTranslator("ar");
    expect(t(REVIEWER_COMMENT_KEYS.approved)).toBe("مُعتمد في النموذج المحلي.");
    expect(t(REVIEWER_COMMENT_KEYS.contested)).toBe("مُعترَض عليه في النموذج المحلي.");
    expect(t(REVIEWER_COMMENT_KEYS.rejected)).toBe("مرفوض في النموذج المحلي.");
    expect(t(REVIEWER_COMMENT_KEYS.deferred)).toBe("مؤجّل في النموذج المحلي.");
    expect(t(REVIEWER_COMMENT_KEYS.escalated)).toBe("مُصعّد في النموذج المحلي.");
    expect(t(REVIEWER_EDITED_EXPLANATION_COMMENT_KEY)).toBe(
      "تم تعديل شرح الملاحظة في النموذج المحلي."
    );
  });
});
