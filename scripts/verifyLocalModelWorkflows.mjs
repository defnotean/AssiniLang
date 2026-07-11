import {
  ok,
  fail,
  skip,
  api,
  GOVERNANCE_POLICY_CONTENT,
  ELDER_WORKFLOW_RATIONALE,
  ELDER_VERIFIED_CLARIFICATION,
  REVIEW_DISPOSITION_REASON,
  REVIEW_DISPOSITION_RESOLUTION
} from "./verifyLocalModelRuntime.mjs";

export async function runPracticeAndEvaluation(languageId) {
  const exercises = await api("GET", `/languages/${languageId}/exercises`, undefined, "reviewer-1");
  if (exercises.status === 200 && Array.isArray(exercises.json) && exercises.json.length > 0) {
    const knownAnswers = new Map([
      ["Translate into English: saku talo-mi-ki", "The child walks."],
      ["Translate into Veridspark: I walk at the river.", "mira-ke talo-mi-na"],
      ["Translate into Veridspark: The child does not sleep.", "saku ma silu-mi-ki"],
      ["Translate into English: saku liru lira-fu-ki", "The child will sing the song."],
      ["Which suffix marks the locative in vima-ke?", "-ke"],
      ["Segment the Veridspark word raki-ko.", "raki-ko"],
      ["Translate into Veridspark: You see the sky.", "piru sora-mi-ta"],
      ["Translate into English: vima-ke talo-fu-mu", "We will walk at the mountain."],
      ["Translate into Veridspark: The children are waiting in the garden.", "nalo-ke saku-pa sepa-mi-se-ki"],
      ["Translate into English: tara-ri niru-ve kora-mi-se-ki", "Honored father is speaking with the friend."],
      ["Which suffix marks progressive aspect in moku-mi-se-ta?", "-se"],
      ["Segment the Veridspark word saku-pa.", "saku-pa"],
      ["Translate into English: pavo-mi-ta vi", "Do you open it?"],
      ["Translate into Veridspark: We remember the story.", "telu leno-mi-mu"],
      [
        "Translate into Veridspark: In the morning, we usually gather fish with a net.",
        "lenu-ke fira penu-ve tima-mi-nu-mu"
      ],
      ["Translate into English: niru talo-mi-ki-la niru ravo-fu-ki", "If the friend walks, the friend will return."],
      ["Which suffix marks habitual aspect in lira-mi-nu-ki?", "-nu"],
      ["Segment the Veridspark word talo-mi-ki-la.", "talo-mi-ki-la"],
      ["Translate into English: nala-ke veka sepa-mi-mu", "We wait because of rain."],
      ["Translate into Veridspark: Open the door.", "meka pavo-ro"],
      ["Which suffix marks imperative mood in pavo-ro?", "-ro"],
      ["Translate into English: ruma-ke ravo-mi-ki-ne", "They say she returns home."],
      ["Which suffix marks reported evidential meaning in ravo-mi-ki-ne?", "-ne"],
      ["Segment the Veridspark word ravo-mi-ki-ne.", "ravo-mi-ki-ne"],
      ["Translate into English: tara kemu-sa vori-mi-ki", "Father protects his basket."],
      ["Which suffix marks possession in kemu-sa?", "-sa"],
      ["Translate into English: lumi ravi eka vaku", "The lamp is brighter than the fire."],
      ["Which particle marks comparison in lumi ravi eka vaku?", "eka"],
      ['Translate into Veridspark: Father says, "Open the door."', "meka pavo-ro vo tara kora-mi-ki"],
      ["Segment the Veridspark word kemu-sa.", "kemu-sa"],
      ["Translate into English: tara ano mara kora-mi-ki", "Father and mother speak."],
      ["Which linker marks contrast in nala pira lumi ravi?", "pira"],
      ["Translate into English: niru ravo-mi-ki-li saku lira-mi-ki", "After the friend returns, the child sings."],
      ["Segment the Veridspark word ravo-mi-ki-li.", "ravo-mi-ki-li"]
    ]);
    const exercise = exercises.json.find((item) => knownAnswers.has(item.prompt)) ?? exercises.json[0];
    const answer = knownAnswers.get(exercise.prompt) ?? "saku talo-mi-ki";
    const submission = await api("POST", `/exercises/${exercise.id}/submissions`, { answer }, "learner-1");
    if (submission.status === 200 && submission.json?.accepted === true) {
      ok("Practice grading", `${exercise.id} accepted`);
    } else {
      fail("Practice grading", `${submission.status} ${String(submission.text).slice(0, 300)}`);
    }
  } else {
    fail("Practice grading", `no exercises: ${exercises.status}`);
  }

  const recommendations = await api("GET", `/languages/${languageId}/exercises/recommended`, undefined, "learner-1");
  if (recommendations.status === 200 && Array.isArray(recommendations.json?.exercises)) {
    ok("Practice recommendations", `${recommendations.json.exercises.length} recommended`);
  } else {
    fail("Practice recommendations", `${recommendations.status} ${String(recommendations.text).slice(0, 300)}`);
  }

  const evalRun = await api("POST", "/evaluations/run", {}, "reviewer-1");
  if (evalRun.status === 200 || evalRun.status === 201) {
    const count = Array.isArray(evalRun.json) ? evalRun.json.length : 1;
    ok("Evaluation run", `${count} run records returned`);
  } else {
    fail("Evaluation run", `${evalRun.status} ${String(evalRun.text).slice(0, 400)}`);
  }
}

export async function ensureGovernanceRecord(languageId) {
  const governance = await api("GET", "/governance", undefined, "reviewer-1");
  if (governance.status !== 200 || !Array.isArray(governance.json)) {
    fail("Governance policy", `${governance.status} ${String(governance.text).slice(0, 300)}`);
    return;
  }

  const existing = governance.json.find(
    (record) => record.languageId === languageId && record.content === GOVERNANCE_POLICY_CONTENT
  );
  if (existing) {
    skip("Governance policy", "verification policy already present");
    return;
  }

  const created = await api(
    "POST",
    "/governance",
    {
      languageId,
      policyType: "generation",
      content: GOVERNANCE_POLICY_CONTENT,
      effectiveDate: "2026-07-07"
    },
    "elder-1"
  );

  if (created.status === 201 && created.json?.content === GOVERNANCE_POLICY_CONTENT) {
    ok("Governance policy", created.json.id);
  } else {
    fail("Governance policy", `${created.status} ${String(created.text).slice(0, 300)}`);
  }
}

export function noteSearchText(note) {
  return `${note.topic ?? ""} ${note.explanation ?? ""}`.toLowerCase();
}

export async function runElderCorrectionWorkflow(languageId) {
  const corrections = await api(
    "GET",
    `/elder/corrections?languageId=${encodeURIComponent(languageId)}`,
    undefined,
    "elder-1"
  );
  if (corrections.status !== 200 || !Array.isArray(corrections.json)) {
    fail("Elder correction workflow", `list ${corrections.status} ${String(corrections.text).slice(0, 300)}`);
    return;
  }

  const existing = corrections.json.find(
    (correction) => correction.rationale === ELDER_WORKFLOW_RATIONALE && correction.status === "applied"
  );
  if (existing) {
    ok("Elder correction workflow", `${existing.id} already applied`);
  } else {
    const notes = await api("GET", `/languages/${languageId}/notes`, undefined, "reviewer-1");
    if (notes.status !== 200 || !Array.isArray(notes.json)) {
      fail("Elder correction workflow", `notes ${notes.status} ${String(notes.text).slice(0, 300)}`);
      return;
    }

    const targetNote =
      notes.json.find((note) => noteSearchText(note).includes("evidential") && noteSearchText(note).includes("-ne")) ??
      notes.json.find((note) => noteSearchText(note).includes("imperative") && noteSearchText(note).includes("-ro")) ??
      notes.json[0];
    if (!targetNote) {
      fail("Elder correction workflow", "no note available for correction");
      return;
    }

    const submitted = await api(
      "POST",
      "/elder/corrections",
      {
        languageId,
        noteId: targetNote.id,
        correction: "Clarify that -ne marks reported evidential meaning after the full finite verb complex.",
        rationale: ELDER_WORKFLOW_RATIONALE,
        severity: "minor",
        contextText: targetNote.explanation
      },
      "elder-1"
    );
    if (submitted.status !== 201 || submitted.json?.status !== "pending_review") {
      fail("Elder correction workflow", `submit ${submitted.status} ${String(submitted.text).slice(0, 300)}`);
      return;
    }

    const reviewed = await api(
      "PATCH",
      `/elder/corrections/${encodeURIComponent(submitted.json.id)}/review`,
      {
        status: "accepted"
      },
      "elder-1"
    );
    if (reviewed.status !== 200 || reviewed.json?.status !== "accepted") {
      fail("Elder correction workflow", `review ${reviewed.status} ${String(reviewed.text).slice(0, 300)}`);
      return;
    }

    const baseExplanation = String(targetNote.explanation ?? "")
      .replace(
        /\s*Elder-verified clarification: -ne marks reported evidential meaning after the whole finite verb complex\.$/,
        ""
      )
      .trim();
    const applied = await api(
      "PATCH",
      `/elder/corrections/${encodeURIComponent(submitted.json.id)}/apply`,
      {
        explanation: `${baseExplanation} ${ELDER_VERIFIED_CLARIFICATION}`.trim()
      },
      "elder-1"
    );

    if (
      applied.status === 200 &&
      applied.json?.correction?.status === "applied" &&
      String(applied.json?.note?.explanation ?? "").includes(ELDER_VERIFIED_CLARIFICATION)
    ) {
      ok("Elder correction workflow", `${applied.json.correction.id} applied to ${targetNote.id}`);
    } else {
      fail("Elder correction workflow", `apply ${applied.status} ${String(applied.text).slice(0, 300)}`);
      return;
    }
  }

  const context = await api("GET", `/languages/${languageId}/elder-context`, undefined, "elder-1");
  const hasPolicy =
    Array.isArray(context.json?.governance) &&
    context.json.governance.some((record) => record.content === GOVERNANCE_POLICY_CONTENT);
  const hasCorrection =
    Array.isArray(context.json?.corrections) &&
    context.json.corrections.some((correction) => correction.rationale === ELDER_WORKFLOW_RATIONALE);
  if (context.status === 200 && hasPolicy && hasCorrection) {
    ok(
      "Elder context",
      `${context.json.corrections.length} corrections, ${context.json.governance.length} governance records`
    );
  } else {
    fail("Elder context", `${context.status}; policy=${hasPolicy}; correction=${hasCorrection}`);
  }
}

export async function runReviewDispositionWorkflow(languageId) {
  const dispositions = await api("GET", `/languages/${languageId}/review-dispositions`, undefined, "elder-1");
  if (dispositions.status !== 200 || !Array.isArray(dispositions.json)) {
    fail("Review disposition workflow", `list ${dispositions.status} ${String(dispositions.text).slice(0, 300)}`);
    return;
  }

  const existingResolved = dispositions.json.find(
    (disposition) => disposition.reason === REVIEW_DISPOSITION_REASON && disposition.status === "resolved"
  );
  if (existingResolved) {
    ok("Review disposition workflow", `${existingResolved.id} already resolved`);
  } else {
    let openDisposition = dispositions.json.find(
      (disposition) => disposition.reason === REVIEW_DISPOSITION_REASON && disposition.status === "open"
    );

    if (!openDisposition) {
      const notes = await api("GET", `/languages/${languageId}/notes`, undefined, "reviewer-1");
      if (notes.status !== 200 || !Array.isArray(notes.json)) {
        fail("Review disposition workflow", `notes ${notes.status} ${String(notes.text).slice(0, 300)}`);
        return;
      }

      const targetNote =
        notes.json.find(
          (note) => noteSearchText(note).includes("progressive") && noteSearchText(note).includes("-se")
        ) ??
        notes.json.find(
          (note) => noteSearchText(note).includes("evidential") && noteSearchText(note).includes("-ne")
        ) ??
        notes.json[0];
      if (!targetNote) {
        fail("Review disposition workflow", "no note available for disposition");
        return;
      }

      const reviewed = await api(
        "PATCH",
        `/notes/${encodeURIComponent(targetNote.id)}/review`,
        {
          status: "escalated",
          reviewerComment: REVIEW_DISPOSITION_REASON,
          dispositionAssigneeId: "elder-1",
          dispositionDueAt: "2026-07-14"
        },
        "reviewer-1"
      );
      if (reviewed.status !== 200 || reviewed.json?.status !== "escalated") {
        fail("Review disposition workflow", `open ${reviewed.status} ${String(reviewed.text).slice(0, 300)}`);
        return;
      }

      const refreshed = await api("GET", `/languages/${languageId}/review-dispositions`, undefined, "elder-1");
      openDisposition = Array.isArray(refreshed.json)
        ? refreshed.json.find(
            (disposition) => disposition.reason === REVIEW_DISPOSITION_REASON && disposition.status === "open"
          )
        : undefined;
      if (!openDisposition) {
        fail("Review disposition workflow", `open disposition not found after note review: ${refreshed.status}`);
        return;
      }
    }

    const resolved = await api(
      "PATCH",
      "/review-dispositions/resolve",
      {
        dispositionId: openDisposition.id,
        resolutionSummary: REVIEW_DISPOSITION_RESOLUTION
      },
      "elder-1"
    );
    if (
      resolved.status === 200 &&
      resolved.json?.status === "resolved" &&
      resolved.json?.resolutionSummary === REVIEW_DISPOSITION_RESOLUTION
    ) {
      ok("Review disposition workflow", `${resolved.json.id} resolved`);
    } else {
      fail("Review disposition workflow", `resolve ${resolved.status} ${String(resolved.text).slice(0, 300)}`);
      return;
    }
  }

  const audit = await api(
    "GET",
    `/audit/events?languageId=${encodeURIComponent(languageId)}`,
    undefined,
    "programmer-1"
  );
  const hasDispositionAudit =
    Array.isArray(audit.json) &&
    audit.json.some(
      (event) => event.action === "review_disposition.resolved" && String(event.summary ?? "").includes("Resolved")
    );
  if (audit.status === 200 && hasDispositionAudit) {
    ok("Audit ledger", `${audit.json.length} language audit events include disposition resolution`);
  } else {
    fail("Audit ledger", `${audit.status}; dispositionResolution=${hasDispositionAudit}`);
  }
}
