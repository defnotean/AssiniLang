import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type Note } from "@assini/db";
import { createServer } from "./server.js";

describe("note review and elder correction integration", () => {
  const reviewedNoteId = "testlang-note-basic-order";

  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  async function fetchReviewedNote(app: ReturnType<typeof createServer>) {
    const notes = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    return notes.json().find((item: { id: string }) => item.id === reviewedNoteId);
  }

  it("updates note review details", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "contested",
        explanation: "Needs one more example before approval.",
        reviewerComment: "Please add a counterexample check."
      }
    });

    expect(response.statusCode).toBe(200);
    const note = response.json();
    expect(note.status).toBe("contested");
    expect(note.explanation).toBe("Needs one more example before approval.");
    expect(note.reviewer.lastReviewedBy).toBe("reviewer-1");
    expect(note.reviewer.comments).toContain("Please add a counterexample check.");
    expect(note.editHistory.at(-1)).toMatchObject({
      by: "reviewer-1",
      action: "reviewed",
      summary: "Please add a counterexample check."
    });
  });

  it("rejects underspecified note explanation edits without mutating the note", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        explanation: "Too short.",
        reviewerComment: "Edited note explanation in local prototype."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Note explanation edits require a substantive explanation.",
      i18nKey: "errors.noteExplanationTooShort"
    });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it.each([
    ["rejected", "Reject until the noun-case examples are corrected."],
    ["deferred", "Defer until an Elder checks the dialect scope."],
    ["escalated", "Escalate for language-lead review before release."]
  ] as const)("records %s note dispositions with comments and audit metadata", async (status, reviewerComment) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: { status, reviewerComment }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: reviewedNoteId,
      status,
      reviewer: expect.objectContaining({
        lastReviewedBy: "reviewer-1",
        comments: expect.arrayContaining([reviewerComment])
      })
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "note.reviewed",
          entityType: "note",
          entityId: reviewedNoteId,
          metadata: expect.objectContaining({
            requestedStatus: status,
            status,
            disposition: status
          })
        })
      ])
    );
  });

  it("tracks assigned review dispositions with due dates and resolution workflow", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const opened = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "escalated",
        reviewerComment: "Escalate until an Elder confirms this teaching note.",
        dispositionAssigneeId: "elder-1",
        dispositionDueAt: "2026-06-20"
      }
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().status).toBe("escalated");

    const dispositions = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-dispositions`,
      headers: authHeaders("reviewer-1")
    });
    expect(dispositions.statusCode).toBe(200);
    expect(dispositions.json()).toHaveLength(1);
    expect(dispositions.json()[0]).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      noteId: reviewedNoteId,
      disposition: "escalated",
      status: "open",
      reason: "Escalate until an Elder confirms this teaching note.",
      assignedTo: "elder-1",
      dueAt: "2026-06-20",
      openedBy: "reviewer-1",
      resolvedAt: null,
      resolvedBy: null,
      resolutionSummary: null
    });

    const dispositionId = dispositions.json()[0].id as string;
    const unauthorizedResolve = await app.inject({
      method: "PATCH",
      url: "/review-dispositions/resolve",
      headers: authHeaders("reviewer-1"),
      payload: {
        dispositionId,
        resolutionSummary: "Reviewer should not resolve assigned Elder work."
      }
    });
    expect(unauthorizedResolve.statusCode).toBe(403);
    expect(unauthorizedResolve.json()).toEqual({ error: "Forbidden" });

    const resolved = await app.inject({
      method: "PATCH",
      url: "/review-dispositions/resolve",
      headers: authHeaders("elder-1"),
      payload: {
        dispositionId,
        resolutionSummary: "Elder confirmed the note can return to reviewer quorum."
      }
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({
      id: dispositionId,
      status: "resolved",
      resolvedBy: "elder-1",
      resolutionSummary: "Elder confirmed the note can return to reviewer quorum."
    });

    const alreadyResolved = await app.inject({
      method: "PATCH",
      url: "/review-dispositions/resolve",
      headers: authHeaders("elder-1"),
      payload: {
        dispositionId,
        resolutionSummary: "Second resolve should be rejected."
      }
    });
    expect(alreadyResolved.statusCode).toBe(400);
    expect(alreadyResolved.json()).toEqual({
      error: "Review disposition is already resolved",
      i18nKey: "governance.errDispositionAlreadyResolved"
    });

    const missingDisposition = await app.inject({
      method: "PATCH",
      url: "/review-dispositions/resolve",
      headers: authHeaders("elder-1"),
      payload: {
        dispositionId: "missing-disposition",
        resolutionSummary: "Unknown disposition should 404."
      }
    });
    expect(missingDisposition.statusCode).toBe(404);
    expect(missingDisposition.json()).toEqual({
      error: "Review disposition not found: missing-disposition",
      i18nKey: "governance.errDispositionNotFound"
    });

    const note = await fetchReviewedNote(app);
    expect(note.status).toBe("under_review");
    expect(note.editHistory.at(-1)).toMatchObject({
      by: "elder-1",
      action: "disposition_resolved",
      summary: "Elder confirmed the note can return to reviewer quorum."
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "review_disposition.created",
          entityType: "review_disposition",
          entityId: dispositionId,
          metadata: expect.objectContaining({
            disposition: "escalated",
            assignedTo: "elder-1",
            dueAt: "2026-06-20"
          })
        }),
        expect.objectContaining({
          action: "review_disposition.resolved",
          entityType: "review_disposition",
          entityId: dispositionId,
          metadata: expect.objectContaining({
            noteStatus: "under_review",
            resolvedBy: "elder-1"
          })
        })
      ])
    );
  });

  it("updates an existing open review disposition instead of creating duplicate open work", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const firstDeferral = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "deferred",
        reviewerComment: "Pause until the next review workshop.",
        dispositionAssigneeId: "elder-1",
        dispositionDueAt: "2026-06-20"
      }
    });
    expect(firstDeferral.statusCode).toBe(200);

    const opened = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-dispositions`,
      headers: authHeaders("lead-1")
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toHaveLength(1);
    const dispositionId = opened.json()[0].id as string;

    const updatedDeferral = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("lead-1"),
      payload: {
        status: "deferred",
        reviewerComment: "Still paused; assign the follow-up to the lead.",
        dispositionAssigneeId: "lead-1",
        dispositionDueAt: "2026-06-27"
      }
    });
    expect(updatedDeferral.statusCode).toBe(200);

    const dispositions = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-dispositions`,
      headers: authHeaders("lead-1")
    });
    expect(dispositions.statusCode).toBe(200);
    expect(dispositions.json()).toHaveLength(1);
    expect(dispositions.json()[0]).toMatchObject({
      id: dispositionId,
      status: "open",
      reason: "Still paused; assign the follow-up to the lead.",
      assignedTo: "lead-1",
      dueAt: "2026-06-27",
      openedBy: "reviewer-1"
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(
      audit.json().filter((event: { action: string }) => event.action === "review_disposition.created")
    ).toHaveLength(1);
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "review_disposition.updated",
          entityType: "review_disposition",
          entityId: dispositionId,
          metadata: expect.objectContaining({
            noteId: reviewedNoteId,
            disposition: "deferred",
            assignedTo: "lead-1",
            dueAt: "2026-06-27"
          })
        })
      ])
    );
  });

  it.each([
    ["contested missing reviewerComment", { status: "contested" }],
    ["contested blank reviewerComment", { status: "contested", reviewerComment: "   " }],
    ["rejected missing reviewerComment", { status: "rejected" }],
    ["deferred missing reviewerComment", { status: "deferred" }],
    ["escalated missing reviewerComment", { status: "escalated" }]
  ])("requires a substantive reviewer comment for note dispositions: %s", async (_, payload) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Review dispositions require reviewerComment",
      i18nKey: "errors.reviewDispositionRequiresComment"
    });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("returns 400 for an invalid review body and does not update the note", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "bogus",
        reviewerComment: "This should not be persisted."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid review body",
      i18nKey: "errors.invalidReviewBody"
    });

    const note = await fetchReviewedNote(app);
    expect(note.status).toBe("draft");
    expect(note.reviewer.comments).not.toContain("This should not be persisted.");
  });

  it.each([
    ["empty object", { payload: {} }],
    ["unknown-only object", { payload: { foo: "bar" } }],
    ["null payload", { payload: null }],
    ["missing payload", {}]
  ])("returns 400 for a %s review body and does not update the note", async (_, injectOptions) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      ...injectOptions
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid review body",
      i18nKey: "errors.invalidReviewBody"
    });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("returns 404 when reviewing a missing note", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: "/notes/missing-note/review",
      headers: authHeaders("reviewer-1"),
      payload: { status: "approved" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Note not found: missing-note",
      i18nKey: "errors.noteNotFound"
    });
  });

  it("returns 404 with i18nKey for unknown language notes and sources list", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const notes = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/notes"
    });
    expect(notes.statusCode).toBe(404);
    expect(notes.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });

    const sources = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/sources",
      headers: authHeaders("reviewer-1")
    });
    expect(sources.statusCode).toBe(404);
    expect(sources.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("resolves authenticated users and uses them for note review audit fields", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const currentUser = await app.inject({ method: "GET", url: "/users/me", headers: authHeaders("elder-1") });
    expect(currentUser.statusCode).toBe(200);
    expect(currentUser.json()).toMatchObject({ id: "elder-1", role: "elder" });

    const unknown = await app.inject({ method: "GET", url: "/users/me", headers: authHeaders("missing-user") });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual({ error: "Unauthorized" });

    const review = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: { status: "approved", reviewerComment: "Elder approved the wording." }
    });

    expect(review.statusCode).toBe(200);
    expect(review.json().reviewer.lastReviewedBy).toBe("elder-1");
    expect(review.json().editHistory.at(-1)).toMatchObject({ by: "elder-1", action: "reviewed" });
  });

  it("lets Elders add pending correction/context records without mutating notes", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const invalidBody = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        correction: "",
        rationale: "Missing correction text.",
        severity: "major"
      }
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json()).toEqual({
      error: "Invalid elder correction body",
      i18nKey: "elderWs.errInvalidCorrectionBody"
    });

    const unknownLanguage = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: "not-a-language",
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major",
        contextText: "Schema-valid body that still targets a missing language."
      }
    });
    expect(unknownLanguage.statusCode).toBe(404);
    expect(unknownLanguage.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });

    const correction = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major",
        contextText: "Keep this local-only until governance approval."
      }
    });

    expect(correction.statusCode).toBe(201);
    expect(correction.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      noteId: reviewedNoteId,
      status: "pending_review",
      proposedBy: "elder-1",
      severity: "major"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(before.explanation);
    expect(after.editHistory).toEqual(before.editHistory);

    const context = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/elder-context`,
      headers: authHeaders("elder-1")
    });
    expect(context.statusCode).toBe(200);
    expect(context.json().corrections).toHaveLength(1);
    expect(JSON.stringify(context.json())).not.toContain("noteAnswerKeys");
    expect(JSON.stringify(context.json())).not.toContain("expectedAnswers");
  });

  it("lets leads review elder corrections with audit attribution", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const created = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });

    const denied = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("learner-1"),
      payload: { status: "accepted" }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: "Forbidden" });

    const reviewed = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });

    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json()).toMatchObject({
      id: created.json().id,
      status: "accepted",
      reviewedBy: "lead-1"
    });
    expect(reviewed.json().reviewedAt).toEqual(expect.any(String));

    const context = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/elder-context`,
      headers: authHeaders("elder-1")
    });
    expect(context.json().corrections[0]).toMatchObject({
      id: created.json().id,
      status: "accepted",
      reviewedBy: "lead-1"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(before.explanation);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("rejects review attempts for elder corrections that are no longer pending", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const created = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });
    expect(created.statusCode).toBe(201);

    const accepted = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });
    expect(accepted.statusCode).toBe(200);

    const rejectedAfterAcceptance = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("elder-1"),
      payload: { status: "rejected" }
    });

    expect(rejectedAfterAcceptance.statusCode).toBe(409);
    expect(rejectedAfterAcceptance.json()).toEqual({
      error: `Elder correction is no longer pending review: ${created.json().id}`,
      i18nKey: "elderWs.errCorrectionNotPending"
    });

    const context = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/elder-context`,
      headers: authHeaders("elder-1")
    });
    expect(context.json().corrections[0]).toMatchObject({
      id: created.json().id,
      status: "accepted",
      reviewedBy: "lead-1"
    });
  });

  it("applies accepted note-linked elder corrections as auditable note edits", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);
    const revisedExplanation = `${before.explanation} Accepted elder correction: mention suffix order before approval.`;

    const created = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });

    const accepted = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });
    expect(accepted.statusCode).toBe(200);

    const applied = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/apply`,
      headers: authHeaders("lead-1"),
      payload: { explanation: revisedExplanation }
    });

    expect(applied.statusCode).toBe(200);
    expect(applied.json().correction).toMatchObject({
      id: created.json().id,
      status: "applied",
      reviewedBy: "lead-1"
    });
    expect(applied.json().note).toMatchObject({
      id: reviewedNoteId,
      explanation: revisedExplanation,
      status: "under_review",
      reviewer: {
        lastReviewedBy: "lead-1",
        comments: expect.arrayContaining([`Applied elder correction ${created.json().id}.`])
      }
    });
    expect(applied.json().note.editHistory.at(-1)).toMatchObject({
      by: "lead-1",
      action: "applied_correction",
      summary: `Applied elder correction ${created.json().id}.`
    });

    const context = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/elder-context`,
      headers: authHeaders("elder-1")
    });
    expect(context.json().corrections[0]).toMatchObject({
      id: created.json().id,
      status: "applied"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(revisedExplanation);
    expect(after.editHistory).toHaveLength(before.editHistory.length + 1);
  });

  it("rejects apply for pending elder corrections and for accepted corrections without a note link", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const pending = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });
    expect(pending.statusCode).toBe(201);

    const applyPending = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(pending.json().id)}/apply`,
      headers: authHeaders("lead-1"),
      payload: { explanation: "Should not apply while still pending review." }
    });
    expect(applyPending.statusCode).toBe(409);
    expect(applyPending.json()).toEqual({
      error: `Elder correction must be accepted before apply: ${pending.json().id}`,
      i18nKey: "elderWs.errCorrectionMustBeAccepted"
    });

    const passageOnly = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        passageId: "testlang-c001",
        correction: "Clarify river-path morphology in the passage gloss.",
        rationale: "Passage context needs a clearer gloss before learner use.",
        severity: "minor"
      }
    });
    expect(passageOnly.statusCode).toBe(201);
    expect(passageOnly.json().noteId).toBeUndefined();

    const acceptedPassageOnly = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(passageOnly.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });
    expect(acceptedPassageOnly.statusCode).toBe(200);

    const applyPassageOnly = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(passageOnly.json().id)}/apply`,
      headers: authHeaders("lead-1"),
      payload: { explanation: "Should not apply without a linked note." }
    });
    expect(applyPassageOnly.statusCode).toBe(400);
    expect(applyPassageOnly.json()).toEqual({
      error: `Elder correction is not linked to a note: ${passageOnly.json().id}`,
      i18nKey: "elderWs.errCorrectionNotLinkedToNote"
    });
  });
});
