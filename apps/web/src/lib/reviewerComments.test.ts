import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n";
import {
  REVIEWER_COMMENT_KEYS,
  REVIEWER_EDITED_EXAMPLES_COMMENT_KEY,
  REVIEWER_EDITED_EXPLANATION_AND_EXAMPLES_COMMENT_KEY,
  REVIEWER_EDITED_EXPLANATION_COMMENT_KEY
} from "./viewConfig";
import type { ReviewStatus } from "./types";

const STATUSES: ReviewStatus[] = ["approved", "contested", "rejected", "deferred", "escalated"];

describe("reviewer comment i18n", () => {
  it("maps every review status to the English comment", () => {
    const t = createTranslator();
    for (const status of STATUSES) {
      expect(t(REVIEWER_COMMENT_KEYS[status])).toMatch(/local prototype\./);
    }
    expect(t(REVIEWER_EDITED_EXPLANATION_COMMENT_KEY)).toBe("Edited note explanation in local prototype.");
    expect(t(REVIEWER_EDITED_EXAMPLES_COMMENT_KEY)).toBe("Edited note examples in local prototype.");
    expect(t(REVIEWER_EDITED_EXPLANATION_AND_EXAMPLES_COMMENT_KEY)).toBe(
      "Edited note explanation and examples in local prototype."
    );
  });
});
