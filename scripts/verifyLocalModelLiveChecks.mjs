import {
  ok,
  fail,
  skip,
  api,
  directJson,
  readDotEnv,
  UPLOADED_NOTEBOOK_SOURCE_TITLE,
  REVIEW_DISPOSITION_STATUSES
} from "./verifyLocalModelRuntime.mjs";
import { passage } from "./verifyLocalModelFixturesCore.mjs";
import {
  buildExerciseDefs,
  buildAdvancedExerciseDefs,
  buildDiscourseExerciseDefs,
  buildCommandExerciseDefs,
  buildRelationalExerciseDefs,
  buildUploadedNotebookExerciseDefs
} from "./verifyLocalModelFixturesExpansion.mjs";
import { getLexemeForms } from "./verifyLocalModelSetup.mjs";

export async function approveNotes(languageId) {
  const notes = await api("GET", `/languages/${languageId}/notes`, undefined, "reviewer-1");
  if (notes.status !== 200 || !Array.isArray(notes.json)) {
    fail("List notes", `${notes.status} ${String(notes.text).slice(0, 200)}`);
    return;
  }

  let changed = 0;
  let waitingForDisposition = 0;
  for (const note of notes.json) {
    if (note.status === "approved") continue;
    if (REVIEW_DISPOSITION_STATUSES.has(note.status)) {
      waitingForDisposition += 1;
      continue;
    }

    const reviewBody = {
      status: "approved",
      reviewerComment: "Local model verification approved this synthetic test note."
    };
    const reviewer = await api("PATCH", `/notes/${note.id}/review`, reviewBody, "reviewer-1");
    const elder = await api("PATCH", `/notes/${note.id}/review`, reviewBody, "elder-1");
    if (reviewer.status >= 200 && reviewer.status < 300 && elder.status >= 200 && elder.status < 300) {
      changed += 1;
    } else {
      fail("Approve note", `${note.id}: reviewer ${reviewer.status}, elder ${elder.status}`);
    }
  }

  if (changed > 0) ok("Approve notes", `${changed} notes reviewed by reviewer and elder`);
  else if (waitingForDisposition > 0)
    skip("Approve notes", `${waitingForDisposition} notes waiting for review disposition`);
  else skip("Approve notes", "all notes already approved");
}

export async function modelDraftNotes(languageId) {
  const draft = await api("POST", `/languages/${languageId}/study-loop/model-draft`, {}, "reviewer-1");
  if (draft.status !== 200) {
    fail("Model-draft notes", `${draft.status} ${String(draft.text).slice(0, 500)}`);
    return;
  }
  ok("Model-draft notes", `${draft.json?.generated ?? 0} generated, ${draft.json?.warnings?.length ?? 0} warnings`);

  const generated = draft.json?.notes ?? [];
  for (const note of generated.slice(0, 4)) {
    const reviewBody = {
      status: "approved",
      reviewerComment: "Approved model-drafted synthetic note during local verification."
    };
    await api("PATCH", `/notes/${note.id}/review`, reviewBody, "reviewer-1");
    await api("PATCH", `/notes/${note.id}/review`, reviewBody, "elder-1");
  }
}

export async function authorExercises(languageId) {
  const notes = await api("GET", `/languages/${languageId}/notes`, undefined, "reviewer-1");
  const exercises = await api("GET", `/languages/${languageId}/exercises`, undefined, "reviewer-1");
  const lexemeForms = await getLexemeForms(languageId);
  if (
    notes.status !== 200 ||
    exercises.status !== 200 ||
    !Array.isArray(notes.json) ||
    !Array.isArray(exercises.json)
  ) {
    fail("Prepare exercises", `notes ${notes.status}, exercises ${exercises.status}`);
    return;
  }
  if (!lexemeForms) return;

  const ruleIds = notes.json.length > 0 ? notes.json.map((note) => note.id) : [];
  if (ruleIds.length === 0) {
    fail("Prepare exercises", "no notes available for allowedRuleIds");
    return;
  }

  const existingPrompts = new Set(exercises.json.map((exercise) => exercise.prompt));
  let created = 0;
  let skipped = 0;
  let skippedMissingVocabulary = 0;
  for (const exercise of [
    ...buildExerciseDefs(ruleIds),
    ...buildAdvancedExerciseDefs(ruleIds),
    ...buildDiscourseExerciseDefs(ruleIds),
    ...buildCommandExerciseDefs(ruleIds),
    ...buildRelationalExerciseDefs(ruleIds),
    ...buildUploadedNotebookExerciseDefs(ruleIds)
  ]) {
    if (existingPrompts.has(exercise.prompt)) {
      skipped += 1;
      continue;
    }
    const missing = exercise.allowedVocabulary.filter((form) => !lexemeForms.has(form.toLowerCase()));
    if (missing.length > 0) {
      skippedMissingVocabulary += 1;
      console.log(`SKIP Exercise expansion: ${exercise.prompt} missing vocabulary ${missing.join(", ")}`);
      continue;
    }
    const res = await api("POST", `/languages/${languageId}/exercises`, exercise, "reviewer-1");
    if (res.status === 201) {
      created += 1;
    } else {
      fail("Author exercise", `${exercise.prompt}: ${res.status} ${String(res.text).slice(0, 300)}`);
    }
  }

  if (created > 0)
    ok(
      "Exercise expansion",
      `${created} created, ${skipped} already present, ${skippedMissingVocabulary} missing vocabulary`
    );
  else
    skip("Exercise expansion", `${skipped} exercises already present, ${skippedMissingVocabulary} missing vocabulary`);
}

export function searchText(item) {
  return `${item.topic ?? ""} ${item.explanation ?? ""} ${item.textTarget ?? ""} ${item.textTranslation ?? ""}`.toLowerCase();
}

export async function assertRelationalExpansion(languageId) {
  const lexemeForms = await getLexemeForms(languageId);
  const corpus = await api("GET", `/languages/${languageId}/corpus`, undefined, "reviewer-1");
  const exercises = await api("GET", `/languages/${languageId}/exercises`, undefined, "reviewer-1");
  if (!lexemeForms || corpus.status !== 200 || exercises.status !== 200) {
    fail(
      "Relational expansion",
      `lexicon=${Boolean(lexemeForms)}, corpus=${corpus.status}, exercises=${exercises.status}`
    );
    return;
  }

  const requiredLexemes = ["-sa", "eka", "vo", "lumi", "rano", "pesa", "varu"];
  const missingLexemes = requiredLexemes.filter((form) => !lexemeForms.has(form));
  const corpusItems = Array.isArray(corpus.json) ? corpus.json : [];
  const exerciseItems = Array.isArray(exercises.json) ? exercises.json : [];
  const corpusChecks = [
    ["possession", (text) => text.includes("kemu-sa") || text.includes("liru-sa")],
    ["comparison", (text) => text.includes(" eka ") || text.includes("brighter than")],
    ["quotation", (text) => text.includes(" vo ") || text.includes("open the door")]
  ];
  const missingCorpus = corpusChecks
    .filter(([, predicate]) => !corpusItems.some((item) => predicate(searchText(item))))
    .map(([label]) => label);
  const requiredPrompts = [
    "Translate into English: tara kemu-sa vori-mi-ki",
    "Which suffix marks possession in kemu-sa?",
    "Which particle marks comparison in lumi ravi eka vaku?",
    'Translate into Veridspark: Father says, "Open the door."'
  ];
  const existingPrompts = new Set(exerciseItems.map((exercise) => exercise.prompt));
  const missingPrompts = requiredPrompts.filter((prompt) => !existingPrompts.has(prompt));

  const failures = [
    missingLexemes.length > 0 ? `lexemes ${missingLexemes.join(", ")}` : "",
    missingCorpus.length > 0 ? `corpus ${missingCorpus.join(", ")}` : "",
    missingPrompts.length > 0 ? `exercises ${missingPrompts.join(", ")}` : ""
  ].filter(Boolean);

  if (failures.length > 0) {
    fail("Relational expansion", failures.join("; "));
  } else {
    ok(
      "Relational expansion",
      `${requiredLexemes.length} lexemes, ${corpusChecks.length} corpus patterns, ${requiredPrompts.length} exercise prompts`
    );
  }
}

export async function assertUploadedNotebookExpansion(languageId) {
  const sources = await api("GET", `/languages/${languageId}/sources`, undefined, "reviewer-1");
  const lexemeForms = await getLexemeForms(languageId);
  const corpus = await api("GET", `/languages/${languageId}/corpus`, undefined, "reviewer-1");
  const exercises = await api("GET", `/languages/${languageId}/exercises`, undefined, "reviewer-1");
  if (sources.status !== 200 || !lexemeForms || corpus.status !== 200 || exercises.status !== 200) {
    fail(
      "Uploaded notebook expansion",
      `sources=${sources.status}, lexicon=${Boolean(lexemeForms)}, corpus=${corpus.status}, exercises=${exercises.status}`
    );
    return;
  }

  const source = Array.isArray(sources.json)
    ? sources.json.find((item) => item.title === UPLOADED_NOTEBOOK_SOURCE_TITLE)
    : undefined;
  const hasFileBackedSource =
    source?.status === "processed" &&
    source?.kind === "document" &&
    typeof source?.filePath === "string" &&
    source.filePath.includes(`/assets/${languageId}/`.replace(/^\/+/, "")) &&
    source?.originalName === "veridspark-uploaded-field-notebook-v1.txt";
  const requiredLexemes = ["ano", "pira", "-li", "ratu", "kulu", "mipa"];
  const missingLexemes = requiredLexemes.filter((form) => !lexemeForms.has(form));
  const corpusItems = Array.isArray(corpus.json) ? corpus.json : [];
  const exerciseItems = Array.isArray(exercises.json) ? exercises.json : [];
  const corpusChecks = [
    ["coordination", (text) => text.includes(" ano ") || text.includes("father and mother")],
    ["contrast", (text) => text.includes(" pira ") || text.includes("but the lamp")],
    ["sequence", (text) => text.includes("-li") || text.includes("after the friend returns")]
  ];
  const missingCorpus = corpusChecks
    .filter(([, predicate]) => !corpusItems.some((item) => predicate(searchText(item))))
    .map(([label]) => label);
  const requiredPrompts = [
    "Translate into English: tara ano mara kora-mi-ki",
    "Which linker marks contrast in nala pira lumi ravi?",
    "Translate into English: niru ravo-mi-ki-li saku lira-mi-ki",
    "Segment the Veridspark word ravo-mi-ki-li."
  ];
  const existingPrompts = new Set(exerciseItems.map((exercise) => exercise.prompt));
  const missingPrompts = requiredPrompts.filter((prompt) => !existingPrompts.has(prompt));

  const failures = [
    hasFileBackedSource ? "" : "file-backed source metadata",
    missingLexemes.length > 0 ? `lexemes ${missingLexemes.join(", ")}` : "",
    missingCorpus.length > 0 ? `corpus ${missingCorpus.join(", ")}` : "",
    missingPrompts.length > 0 ? `exercises ${missingPrompts.join(", ")}` : ""
  ].filter(Boolean);

  if (failures.length > 0) {
    fail("Uploaded notebook expansion", failures.join("; "));
  } else {
    ok(
      "Uploaded notebook expansion",
      `${requiredLexemes.length} lexemes, ${corpusChecks.length} corpus patterns, ${requiredPrompts.length} exercise prompts`
    );
  }
}

export function selectIdsByPriority(items, predicates, fallback = []) {
  const selected = [];
  for (const predicate of predicates) {
    const item = items.find((candidate) => !selected.includes(candidate.id) && predicate(searchText(candidate)));
    if (item) selected.push(item.id);
  }
  for (const id of fallback) {
    if (!selected.includes(id)) selected.push(id);
  }
  return selected.slice(0, 8);
}

export function latestAssistantMessage(session) {
  const assistantMessages = (session?.messages ?? []).filter((message) => message.role === "assistant");
  return assistantMessages[assistantMessages.length - 1]?.content ?? "";
}

export function assistantMentionsMorpheme(text, morpheme) {
  if ((morpheme.startsWith("-") || morpheme.endsWith("-")) && text.includes(morpheme)) {
    return true;
  }
  return new RegExp(`(^|[^A-Za-z0-9])${morpheme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`).test(text);
}

export async function runLiveModelChecks(languageId) {
  const status = await api("GET", "/llm/status", undefined, "programmer-1");
  if (status.status === 200 && status.json?.configured) {
    ok("LLM status", `${status.json.provider} ${status.json.model ?? ""}`.trim());
  } else {
    fail("LLM status", `${status.status} ${String(status.text).slice(0, 300)}`);
    return;
  }

  const health = await api("POST", "/llm/health-check", {}, "programmer-1");
  if (health.status === 200 && health.json?.reachable) {
    ok("LLM health-check", `${health.json.latencyMs ?? "?"}ms, ${health.json.detail ?? "reachable"}`);
  } else {
    fail("LLM health-check", `${health.status} ${String(health.text).slice(0, 400)}`);
  }

  const discover = await api("GET", "/llm/models", undefined, "programmer-1");
  if (discover.status === 200) {
    const modelNames = (discover.json?.models ?? []).map((model) => model.model).slice(0, 5);
    ok("Model discovery", modelNames.join(", ") || "no models");
  } else {
    fail("Model discovery", `${discover.status} ${String(discover.text).slice(0, 300)}`);
  }

  const envFile = await readDotEnv();
  const baseUrl = status.json?.baseUrl ?? envFile.ASSINI_LLM_BASE_URL;
  if (baseUrl) {
    try {
      const direct = await directJson(`${baseUrl.replace(/\/+$/, "")}/models`);
      if (direct.status === 200) {
        const directNames = [
          ...(direct.json?.data ?? []).map((model) => model.id),
          ...(direct.json?.models ?? []).map((model) => model.model ?? model.name)
        ].filter(Boolean);
        ok("Direct provider /models", directNames.slice(0, 3).join(", ") || "endpoint returned no names");
      } else {
        fail("Direct provider /models", `${direct.status} ${String(direct.text).slice(0, 200)}`);
      }
    } catch (error) {
      fail("Direct provider /models", error instanceof Error ? error.message : String(error));
    }
  }

  const notes = await api("GET", `/languages/${languageId}/notes`, undefined, "reviewer-1");
  const corpus = await api("GET", `/languages/${languageId}/corpus`, undefined, "reviewer-1");
  const noteItems = Array.isArray(notes.json) ? notes.json : [];
  const corpusItems = Array.isArray(corpus.json) ? corpus.json : [];
  const contextNoteIds = selectIdsByPriority(
    noteItems,
    [
      (text) => text.includes("sequential") && text.includes("-li"),
      (text) => text.includes("contrast") && text.includes("pira"),
      (text) => text.includes("coordination") && text.includes("ano"),
      (text) => text.includes("possess") && text.includes("-sa"),
      (text) => text.includes("comparative") && text.includes("eka"),
      (text) => text.includes("quotative") && text.includes("vo"),
      (text) => text.includes("progressive") && text.includes("-se"),
      (text) => text.includes("habitual") && text.includes("-nu"),
      (text) => text.includes("imperative") && text.includes("-ro"),
      (text) => text.includes("evidential") && text.includes("-ne"),
      (text) => text.includes("negation"),
      (text) => text.includes("tense") && text.includes("person")
    ],
    noteItems.slice(0, 4).map((note) => note.id)
  );
  const contextPassageIds = selectIdsByPriority(
    corpusItems,
    [
      (text) => text.includes("-li") || text.includes("after the friend returns"),
      (text) => text.includes(" pira ") || text.includes("but the lamp"),
      (text) => text.includes(" ano ") || text.includes("father and mother"),
      (text) => text.includes("-sa") || text.includes("possessed"),
      (text) => text.includes(" eka ") || text.includes("brighter than") || text.includes("stronger than"),
      (text) => text.includes(" vo ") || text.includes("says"),
      (text) => text.includes("-mi-se-") || text.includes("progressive"),
      (text) => text.includes("-mi-nu-") || text.includes("usually"),
      (text) => text.includes("-ro") || text.includes("open the door") || text.includes("send the message"),
      (text) => text.includes("-ne") || text.includes("they say"),
      (text) => text.includes(" ma "),
      (text) => text.includes("-fu")
    ],
    corpusItems.slice(0, 4).map((passage) => passage.id)
  );
  const commandContextNoteIds = selectIdsByPriority(
    noteItems,
    [
      (text) => text.includes("imperative") && text.includes("-ro"),
      (text) => text.includes("reported") && text.includes("-ne"),
      (text) => text.includes("evidential") && text.includes("-ne")
    ],
    contextNoteIds
  );
  const commandContextPassageIds = selectIdsByPriority(
    corpusItems,
    [
      (text) => text.includes("-ro") || text.includes("open the door") || text.includes("send the message"),
      (text) => text.includes("-ne") || text.includes("they say")
    ],
    contextPassageIds
  );

  const ai = await api(
    "POST",
    "/ai/sessions",
    {
      languageId,
      mode: "programmer_debug",
      seedPrompt:
        "Using only the supplied Veridspark context, explain in five short bullets how negation, tense/person suffixes, progressive aspect, imperative mood, and reported evidential marking work. Name the exact progressive, imperative, and reported-evidential suffixes.",
      contextNoteIds,
      contextPassageIds
    },
    "programmer-1"
  );

  if (ai.status === 201) {
    const assistant = latestAssistantMessage(ai.json);
    if (assistant.length > 20 && !assistant.toLowerCase().includes("deterministic fallback")) {
      ok("AI session live reply", assistant.replace(/\s+/g, " ").slice(0, 180));
    } else {
      fail("AI session live reply", `weak assistant response: ${assistant.slice(0, 200)}`);
    }

    const followUp = await api(
      "POST",
      `/ai/sessions/${encodeURIComponent(ai.json.id)}/messages`,
      {
        content:
          "According to the supplied Veridspark examples, which suffix marks progressive aspect? Answer with the suffix and one short reason."
      },
      "programmer-1"
    );
    const followUpAssistant = latestAssistantMessage(followUp.json);
    if (
      followUp.status === 200 &&
      followUp.json?.status === "active" &&
      followUpAssistant.length > 10 &&
      assistantMentionsMorpheme(followUpAssistant, "-se") &&
      !followUpAssistant.toLowerCase().includes("deterministic fallback") &&
      followUp.json?.privacy?.exposesHiddenChainOfThought === false
    ) {
      ok("AI session follow-up", followUpAssistant.replace(/\s+/g, " ").slice(0, 180));
    } else {
      fail(
        "AI session follow-up",
        `${followUp.status}; expected -se for progressive aspect; got ${followUpAssistant.replace(/\s+/g, " ").slice(0, 300) || String(followUp.text).slice(0, 300)}`
      );
    }

    const commandFollowUp = await api(
      "POST",
      "/ai/sessions",
      {
        languageId,
        mode: "programmer_debug",
        seedPrompt:
          "Using only the supplied command/evidential Veridspark context, which suffix marks imperative mood and which suffix marks reported evidential meaning? Answer with -ro and -ne. Do not use the quotative particle vo as the reported evidential suffix.",
        contextNoteIds: commandContextNoteIds,
        contextPassageIds: commandContextPassageIds
      },
      "programmer-1"
    );
    const commandAssistant = latestAssistantMessage(commandFollowUp.json);
    if (
      commandFollowUp.status === 201 &&
      commandFollowUp.json?.status === "active" &&
      assistantMentionsMorpheme(commandAssistant, "-ro") &&
      assistantMentionsMorpheme(commandAssistant, "-ne") &&
      !commandAssistant.toLowerCase().includes("deterministic fallback") &&
      commandFollowUp.json?.privacy?.exposesHiddenChainOfThought === false
    ) {
      ok("AI session command/evidential follow-up", commandAssistant.replace(/\s+/g, " ").slice(0, 180));
    } else {
      fail(
        "AI session command/evidential follow-up",
        `${commandFollowUp.status}; expected -ro and -ne; got ${commandAssistant.replace(/\s+/g, " ").slice(0, 300) || String(commandFollowUp.text).slice(0, 300)}`
      );
    }

    const relationalFollowUp = await api(
      "POST",
      `/ai/sessions/${encodeURIComponent(ai.json.id)}/messages`,
      {
        content:
          "According to the supplied Veridspark examples, what marks possessed nouns, what marks comparison, and what marks quoted speech? Answer with -sa, eka, and vo."
      },
      "programmer-1"
    );
    const relationalAssistant = latestAssistantMessage(relationalFollowUp.json);
    if (
      relationalFollowUp.status === 200 &&
      relationalFollowUp.json?.status === "active" &&
      assistantMentionsMorpheme(relationalAssistant, "-sa") &&
      assistantMentionsMorpheme(relationalAssistant, "eka") &&
      assistantMentionsMorpheme(relationalAssistant, "vo") &&
      !relationalAssistant.toLowerCase().includes("deterministic fallback") &&
      relationalFollowUp.json?.privacy?.exposesHiddenChainOfThought === false
    ) {
      ok("AI session relational follow-up", relationalAssistant.replace(/\s+/g, " ").slice(0, 180));
    } else {
      fail(
        "AI session relational follow-up",
        `${relationalFollowUp.status}; expected -sa, eka, and vo; got ${relationalAssistant.replace(/\s+/g, " ").slice(0, 300) || String(relationalFollowUp.text).slice(0, 300)}`
      );
    }
  } else {
    fail("AI session live reply", `${ai.status} ${String(ai.text).slice(0, 500)}`);
  }

  const learnerSession = await api(
    "POST",
    "/ai/sessions",
    {
      languageId,
      mode: "learner_practice",
      seedPrompt:
        "You are tutoring a Veridspark learner. In two short sentences, explain what -li means in ravo-mi-ki-li and give the English meaning of niru ravo-mi-ki-li saku lira-mi-ki. Include the suffix -li.",
      contextNoteIds,
      contextPassageIds
    },
    "learner-1"
  );
  const learnerAssistant = latestAssistantMessage(learnerSession.json);
  if (
    learnerSession.status === 201 &&
    learnerSession.json?.mode === "learner_practice" &&
    assistantMentionsMorpheme(learnerAssistant, "-li") &&
    learnerAssistant.toLowerCase().includes("after") &&
    !learnerAssistant.toLowerCase().includes("deterministic fallback") &&
    learnerSession.json?.privacy?.exposesHiddenChainOfThought === false
  ) {
    ok("AI learner-practice session", learnerAssistant.replace(/\s+/g, " ").slice(0, 180));
  } else {
    fail(
      "AI learner-practice session",
      `${learnerSession.status}; expected -li learner explanation; got ${learnerAssistant.replace(/\s+/g, " ").slice(0, 300) || String(learnerSession.text).slice(0, 300)}`
    );
  }

  const elderSession = await api(
    "POST",
    "/ai/sessions",
    {
      languageId,
      mode: "elder_review",
      seedPrompt:
        "You are helping an Elder review Veridspark notes. In three bullets, identify the markers for possession, quotation, and contrast. Answer with -sa, vo, and pira.",
      contextNoteIds,
      contextPassageIds
    },
    "elder-1"
  );
  const elderAssistant = latestAssistantMessage(elderSession.json);
  if (
    elderSession.status === 201 &&
    elderSession.json?.mode === "elder_review" &&
    assistantMentionsMorpheme(elderAssistant, "-sa") &&
    assistantMentionsMorpheme(elderAssistant, "vo") &&
    assistantMentionsMorpheme(elderAssistant, "pira") &&
    !elderAssistant.toLowerCase().includes("deterministic fallback") &&
    elderSession.json?.privacy?.exposesHiddenChainOfThought === false
  ) {
    ok("AI elder-review session", elderAssistant.replace(/\s+/g, " ").slice(0, 180));
  } else {
    fail(
      "AI elder-review session",
      `${elderSession.status}; expected -sa, vo, and pira; got ${elderAssistant.replace(/\s+/g, " ").slice(0, 300) || String(elderSession.text).slice(0, 300)}`
    );
  }

  const generatedExercise = await api(
    "POST",
    `/languages/${languageId}/exercises/generate`,
    {
      type: "translate_to_english"
    },
    "reviewer-1"
  );

  if (generatedExercise.status === 200 && generatedExercise.json?.exercise?.prompt) {
    ok("Model exercise generation", generatedExercise.json.exercise.prompt.slice(0, 160));
  } else {
    fail("Model exercise generation", `${generatedExercise.status} ${String(generatedExercise.text).slice(0, 500)}`);
  }
}
