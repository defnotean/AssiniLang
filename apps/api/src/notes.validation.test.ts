import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

const reviewedNoteId = `${TEST_LANGUAGE_ID}-note-basic-order`;

describe("note route validation i18nKeys", () => {
  it("returns languageNotFound i18nKey for unknown language note lists", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/notes"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("rejects invalid review bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: { status: "bogus" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid review body",
      i18nKey: "errors.invalidReviewBody"
    });
  });

  it("returns reviewDispositionRequiresComment i18nKey when disposition comment is missing", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: { status: "contested" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Review dispositions require reviewerComment",
      i18nKey: "errors.reviewDispositionRequiresComment"
    });
  });

  it("returns reviewDispositionAssigneeInvalid i18nKey for non-assignable disposition assignees", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "deferred",
        reviewerComment: "Defer until an assignable reviewer can follow up.",
        dispositionAssigneeId: "learner-1"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Review disposition assignee is not assignable: learner-1",
      i18nKey: "errors.reviewDispositionAssigneeInvalid"
    });
  });

  it("returns reviewDispositionDueAtInvalid i18nKey for unparseable disposition due dates", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "deferred",
        reviewerComment: "Defer with a follow-up date.",
        dispositionDueAt: "not-a-date"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Review disposition due date must be parseable",
      i18nKey: "errors.reviewDispositionDueAtInvalid"
    });
  });

  it("returns noteNotFound i18nKey when reviewing a missing note", async () => {
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

  it("updates note examples from language passages and appends editHistory", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/notes`
    });
    const beforeNote = before.json().find((item: { id: string }) => item.id === reviewedNoteId);
    expect(beforeNote.examples).toHaveLength(1);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        examples: [
          {
            passageId: `${TEST_LANGUAGE_ID}-c001`,
            target: "mira talo-na",
            translation: "I walk by the river."
          },
          {
            passageId: `${TEST_LANGUAGE_ID}-c003`,
            target: "saku talo-ki",
            translation: "The child walks."
          }
        ],
        reviewerComment: "Edited note examples in local prototype."
      }
    });

    expect(response.statusCode).toBe(200);
    const note = response.json();
    expect(note.examples).toEqual([
      {
        passageId: `${TEST_LANGUAGE_ID}-c001`,
        target: "mira talo-na",
        translation: "I walk by the river."
      },
      {
        passageId: `${TEST_LANGUAGE_ID}-c003`,
        target: "saku talo-ki",
        translation: "The child walks."
      }
    ]);
    expect(note.editHistory.at(-1)).toMatchObject({
      by: "reviewer-1",
      action: "reviewed",
      summary: "Edited note examples in local prototype."
    });
    expect(note.reviewer.comments).toContain("Edited note examples in local prototype.");
  });

  it("rejects note examples whose passageId is outside the note language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        examples: [
          {
            passageId: "missing-passage",
            target: "mira talo-na",
            translation: "I walk by the river."
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Note example passage is not in language: missing-passage",
      i18nKey: "errors.noteExamplePassageInvalid"
    });
  });

  it("rejects note examples whose text does not match the corpus passage", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        examples: [
          {
            passageId: `${TEST_LANGUAGE_ID}-c001`,
            target: "wrong target",
            translation: "I walk by the river."
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: `Note example text must match corpus passage: ${TEST_LANGUAGE_ID}-c001`,
      i18nKey: "errors.noteExampleTextMismatch"
    });
  });
});
