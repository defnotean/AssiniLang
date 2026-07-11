import {
  ok,
  fail,
  skip,
  api,
  apiForm,
  LANGUAGE_NAME,
  PREFERRED_MODEL,
  PREFERRED_MODEL_BASE_URL,
  VERIFY_MAX_TOKENS,
  SOURCE_TITLE,
  DISCOURSE_GROUNDING_SOURCE_TITLE,
  COMMAND_GROUNDING_SOURCE_TITLE,
  UPLOADED_NOTEBOOK_SOURCE_TITLE,
  VERIDSPARK_PHONOLOGY
} from "./verifyLocalModelRuntime.mjs";
import {
  EXPANSION_PASSAGES,
  MODEL_SOURCE_TEXT,
  DISCOURSE_GROUNDING_SOURCE_TEXT,
  COMMAND_GROUNDING_SOURCE_TEXT,
  UPLOADED_NOTEBOOK_SOURCE_TEXT,
  ADVANCED_PASSAGES,
  DISCOURSE_PASSAGES
} from "./verifyLocalModelFixturesCore.mjs";
import {
  COMMAND_PASSAGES,
  RELATIONAL_PASSAGES,
  UPLOADED_NOTEBOOK_PASSAGES
} from "./verifyLocalModelFixturesExpansion.mjs";

export function ids(items) {
  return items.map((item) => item.id);
}

export function sameModel(left, right) {
  return (
    String(left ?? "")
      .trim()
      .toLowerCase() ===
    String(right ?? "")
      .trim()
      .toLowerCase()
  );
}

export function visibleAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

export async function probeDiscoveredModel(candidate) {
  const url = `${candidate.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: candidate.model,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        max_tokens: 256,
        temperature: 0,
        stream: false
      })
    });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    if (!response.ok) {
      return { ok: false, detail: `status ${response.status}: ${String(text).slice(0, 160)}` };
    }
    const content = visibleAssistantContent(json);
    if (!content) {
      const reasoning = json?.choices?.[0]?.message?.reasoning_content;
      return {
        ok: false,
        detail:
          typeof reasoning === "string" && reasoning.trim()
            ? "reasoning_content only; no visible assistant content"
            : "empty visible assistant content"
      };
    }
    return { ok: true, detail: content.slice(0, 80) };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export async function configurePreferredModel() {
  if (process.env.ASSINI_VERIFY_AUTO_SWITCH_MODEL === "false") {
    skip("Preferred model switch", "disabled by ASSINI_VERIFY_AUTO_SWITCH_MODEL=false");
    return;
  }

  const [status, discovery] = await Promise.all([
    api("GET", "/llm/status", undefined, "programmer-1"),
    api("GET", "/llm/models", undefined, "programmer-1")
  ]);

  if (discovery.status !== 200 || !Array.isArray(discovery.json?.models)) {
    fail("Preferred model discovery", `${discovery.status} ${String(discovery.text).slice(0, 300)}`);
    return;
  }

  const candidates = discovery.json.models;
  const preferred =
    candidates.find(
      (candidate) =>
        sameModel(candidate.model, PREFERRED_MODEL) &&
        (!PREFERRED_MODEL_BASE_URL || candidate.baseUrl === PREFERRED_MODEL_BASE_URL)
    ) ??
    candidates.find(
      (candidate) =>
        String(candidate.model ?? "")
          .toLowerCase()
          .includes(PREFERRED_MODEL.toLowerCase()) &&
        (!PREFERRED_MODEL_BASE_URL || candidate.baseUrl === PREFERRED_MODEL_BASE_URL)
    );

  const current = candidates.find(
    (candidate) =>
      status.status === 200 && status.json?.baseUrl === candidate.baseUrl && status.json?.model === candidate.model
  );
  const orderedCandidates = [preferred, current, ...candidates].filter(
    (candidate, index, all) => candidate && all.findIndex((item) => item?.id === candidate.id) === index
  );

  if (orderedCandidates.length === 0) {
    skip("Preferred model switch", "no discovered models to probe");
    return;
  }

  let selected;
  const rejected = [];
  for (const candidate of orderedCandidates) {
    const probe = await probeDiscoveredModel(candidate);
    if (probe.ok) {
      selected = candidate;
      ok("Model chat probe", `${candidate.model} @ ${candidate.baseUrl}: ${probe.detail}`);
      break;
    }
    rejected.push(`${candidate.model} @ ${candidate.baseUrl} (${probe.detail})`);
  }

  if (!selected) {
    fail("Model chat probe", rejected.join("; ").slice(0, 600));
    return;
  }

  if (preferred && selected.id !== preferred.id) {
    skip("Preferred model probe", `${preferred.model} was listed but not usable; selected ${selected.model}`);
  }

  if (status.status === 200 && status.json?.baseUrl === selected.baseUrl && status.json?.model === selected.model) {
    skip("Preferred model switch", `${selected.model} already active`);
    return;
  }

  const saved = await api(
    "PUT",
    "/llm/settings",
    {
      provider: selected.provider,
      baseUrl: selected.baseUrl,
      model: selected.model,
      timeoutMs: 300_000,
      maxTokens: Number.isInteger(VERIFY_MAX_TOKENS) && VERIFY_MAX_TOKENS > 0 ? VERIFY_MAX_TOKENS : 8192,
      jsonMode: process.env.ASSINI_VERIFY_JSON_MODE === "false" ? false : true
    },
    "programmer-1"
  );

  if (saved.status === 200) {
    ok("Preferred model switch", `${selected.model} @ ${selected.baseUrl}`);
  } else {
    fail("Preferred model switch", `${saved.status} ${String(saved.text).slice(0, 300)}`);
  }
}

export async function ensureLanguage() {
  const languages = await api("GET", "/languages", undefined, "reviewer-1");
  if (languages.status !== 200 || !Array.isArray(languages.json)) {
    fail("List languages", `${languages.status} ${String(languages.text).slice(0, 200)}`);
    return undefined;
  }

  let language = languages.json.find((item) => item.name === LANGUAGE_NAME);
  if (language) {
    ok("Language found", `${language.name} (${language.id})`);
    const consonants = new Set(language.phonology?.consonants ?? []);
    if (!consonants.has("f")) {
      const patched = await api(
        "PATCH",
        `/languages/${language.id}`,
        {
          phonology: VERIDSPARK_PHONOLOGY,
          orthography: "Latin lowercase; hyphen marks bound suffixes such as -mi, -ke, -ko, and -fu."
        },
        "reviewer-1"
      );
      if (patched.status === 200) {
        language = patched.json;
        ok("Language phonology patched", "added f for future suffix -fu");
      } else {
        fail("Language phonology patched", `${patched.status} ${String(patched.text).slice(0, 300)}`);
      }
    }
    return language;
  }

  const created = await api("POST", "/languages", {
    name: LANGUAGE_NAME,
    description:
      "Veridspark is a constructed agglutinative language used for local-model integration testing in AssiniLang.",
    orthography: "Latin lowercase; hyphen marks bound suffixes such as -mi, -ke, and -ko.",
    typology: "agglutinative",
    phonology: VERIDSPARK_PHONOLOGY
  });

  if (created.status !== 201) {
    fail("Create language", `${created.status} ${String(created.text).slice(0, 300)}`);
    return undefined;
  }

  ok("Language created", `${created.json.name} (${created.json.id})`);
  return created.json;
}

export async function getLexemeForms(languageId) {
  const lexicon = await api("GET", `/languages/${languageId}/lexicon`, undefined, "reviewer-1");
  if (lexicon.status !== 200 || !Array.isArray(lexicon.json)) {
    fail("List lexicon", `${lexicon.status} ${String(lexicon.text).slice(0, 200)}`);
    return undefined;
  }
  return new Set(lexicon.json.map((lexeme) => String(lexeme.form ?? "").toLowerCase()));
}

export async function hasLexemeForm(languageId, form) {
  const lexemeForms = await getLexemeForms(languageId);
  return lexemeForms?.has(form.toLowerCase()) ?? false;
}

export function missingGroundedMorphemes(item, lexemeForms) {
  const missing = [];
  for (const morpheme of item.morphologicalSegmentation ?? []) {
    const gloss = String(morpheme.gloss ?? "").toLowerCase();
    if (gloss === "unanalyzed") continue;
    const surface = String(morpheme.surface ?? "").toLowerCase();
    const lemma = String(morpheme.lemma ?? "").toLowerCase();
    if (!lexemeForms.has(surface) && !lexemeForms.has(lemma)) {
      missing.push(morpheme.surface);
    }
  }
  return [...new Set(missing)];
}

export async function importCorpusPack(languageId, passages, label, options = {}) {
  const lexemeForms = options.requireLexiconGrounding ? await getLexemeForms(languageId) : undefined;
  if (options.requireLexiconGrounding && !lexemeForms) return;

  let imported = 0;
  let skipped = 0;
  let skippedMissing = 0;
  for (const item of passages) {
    if (lexemeForms) {
      const missing = missingGroundedMorphemes(item, lexemeForms);
      if (missing.length > 0) {
        skippedMissing += 1;
        console.log(`SKIP ${label} passage: ${item.textTarget} missing lexemes ${missing.join(", ")}`);
        continue;
      }
    }

    const res = await api("POST", `/languages/${languageId}/corpus`, item, "reviewer-1");
    if (res.status === 201) {
      imported += 1;
    } else if (res.status === 400 && String(res.json?.error ?? "").includes("already exists")) {
      skipped += 1;
    } else {
      fail("Import corpus passage", `${item.textTarget}: ${res.status} ${String(res.text).slice(0, 240)}`);
    }
  }

  if (imported > 0) ok(label, `${imported} imported, ${skipped} already present, ${skippedMissing} missing lexemes`);
  else skip(label, `${skipped} passages already present, ${skippedMissing} missing lexemes`);
}

export async function importExpansionCorpus(languageId) {
  await importCorpusPack(languageId, EXPANSION_PASSAGES, "Corpus expansion");
}

export async function importAdvancedCorpus(languageId) {
  await importCorpusPack(languageId, ADVANCED_PASSAGES, "Advanced corpus expansion", { requireLexiconGrounding: true });
}

export async function importDiscourseCorpus(languageId) {
  await importCorpusPack(languageId, DISCOURSE_PASSAGES, "Discourse corpus expansion", {
    requireLexiconGrounding: true
  });
}

export async function importCommandCorpus(languageId) {
  await importCorpusPack(languageId, COMMAND_PASSAGES, "Command/evidential corpus expansion", {
    requireLexiconGrounding: true
  });
}

export async function importRelationalCorpus(languageId) {
  await importCorpusPack(languageId, RELATIONAL_PASSAGES, "Relational corpus expansion", {
    requireLexiconGrounding: true
  });
}

export async function importUploadedNotebookCorpus(languageId) {
  await importCorpusPack(languageId, UPLOADED_NOTEBOOK_PASSAGES, "Uploaded notebook corpus expansion", {
    requireLexiconGrounding: true
  });
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForSourceProcessed(languageId, sourceId, label, timeoutMs = 360_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const sources = await api("GET", `/languages/${languageId}/sources`, undefined, "reviewer-1");
    const source = Array.isArray(sources.json) ? sources.json.find((item) => item.id === sourceId) : undefined;
    if (source?.status === "processed") return source;
    if (source?.status === "failed") {
      fail(label, source.error ?? "source processing failed");
      return undefined;
    }
    await sleep(2_000);
  }
  fail(label, `timed out waiting for source ${sourceId}`);
  return undefined;
}

export async function acceptProposedDraftsForSource(languageId, sourceId, label) {
  const drafts = await api(
    "GET",
    `/languages/${languageId}/extraction-drafts?status=proposed`,
    undefined,
    "reviewer-1"
  );
  if (drafts.status !== 200 || !Array.isArray(drafts.json)) {
    fail(label, `draft list ${drafts.status} ${String(drafts.text).slice(0, 200)}`);
    return;
  }

  const proposed = drafts.json.filter((draft) => draft.sourceAssetId === sourceId && draft.status === "proposed");
  if (proposed.length === 0) {
    skip(label, "no proposed drafts returned");
    return;
  }

  const bulk = await api(
    "POST",
    `/languages/${languageId}/extraction-drafts/bulk-review`,
    {
      action: "accept",
      draftIds: ids(proposed).slice(0, 40)
    },
    "reviewer-1"
  );

  if (bulk.status === 200) {
    ok(label, `${bulk.json?.accepted ?? 0} accepted, ${bulk.json?.failed ?? 0} failed`);
  } else {
    fail(label, `${bulk.status} ${String(bulk.text).slice(0, 300)}`);
  }
}

export async function processModelSource(languageId, title = SOURCE_TITLE, rawText = MODEL_SOURCE_TEXT, options = {}) {
  const sources = await api("GET", `/languages/${languageId}/sources`, undefined, "reviewer-1");
  const alreadyProcessed =
    Array.isArray(sources.json) &&
    sources.json.some((source) => source.title === title && source.status === "processed");

  if (alreadyProcessed) {
    skip("Model source extraction", `${title} already processed`);
    return;
  }

  const source = await api(
    "POST",
    `/languages/${languageId}/sources`,
    {
      kind: "text",
      title,
      rawText
    },
    "reviewer-1"
  );

  if (source.status !== 201) {
    fail("Register model source", `${source.status} ${String(source.text).slice(0, 300)}`);
    return;
  }

  const processed = await api(
    "POST",
    `/sources/${source.json.id}/process`,
    options.async ? { async: true } : {},
    "reviewer-1"
  );
  if (options.async) {
    if (processed.status !== 202) {
      fail("Start async model source", `${processed.status} ${String(processed.text).slice(0, 500)}`);
      return;
    }
    ok("Start async model source", `${title} queued`);
    const finalSource = await waitForSourceProcessed(languageId, source.json.id, "Async model source extraction");
    if (!finalSource) return;
    ok(
      "Async model source extraction",
      `${finalSource.summary ?? "processed"}${finalSource.warnings?.length ? `, ${finalSource.warnings.length} warnings` : ""}`
    );
    await acceptProposedDraftsForSource(languageId, source.json.id, "Accept async source drafts");
    return;
  }

  if (processed.status !== 200) {
    fail("Process model source", `${processed.status} ${String(processed.text).slice(0, 500)}`);
    return;
  }

  const drafts = processed.json?.drafts ?? [];
  ok("Process model source", `${drafts.length} drafts, ${processed.json?.warnings?.length ?? 0} warnings`);

  const proposed = drafts.filter((draft) => draft.status === "proposed");
  if (proposed.length === 0) {
    skip("Accept model source drafts", "no proposed drafts returned");
    return;
  }

  const bulk = await api(
    "POST",
    `/languages/${languageId}/extraction-drafts/bulk-review`,
    {
      action: "accept",
      draftIds: ids(proposed).slice(0, 40)
    },
    "reviewer-1"
  );

  if (bulk.status === 200) {
    ok("Accept model source drafts", `${bulk.json?.accepted ?? 0} accepted, ${bulk.json?.failed ?? 0} failed`);
  } else {
    fail("Accept model source drafts", `${bulk.status} ${String(bulk.text).slice(0, 300)}`);
  }
}

export async function processUploadedNotebookSource(languageId) {
  const sources = await api("GET", `/languages/${languageId}/sources`, undefined, "reviewer-1");
  if (sources.status !== 200 || !Array.isArray(sources.json)) {
    fail("Uploaded source lookup", `${sources.status} ${String(sources.text).slice(0, 200)}`);
    return;
  }

  let source = sources.json.find((item) => item.title === UPLOADED_NOTEBOOK_SOURCE_TITLE);
  if (source?.status === "processed") {
    skip("Uploaded source extraction", `${UPLOADED_NOTEBOOK_SOURCE_TITLE} already processed`);
    return;
  }

  if (!source) {
    const form = new FormData();
    form.append("title", UPLOADED_NOTEBOOK_SOURCE_TITLE);
    form.append(
      "file",
      new Blob([UPLOADED_NOTEBOOK_SOURCE_TEXT], { type: "text/plain" }),
      "veridspark-uploaded-field-notebook-v1.txt"
    );

    const uploaded = await apiForm("POST", `/languages/${languageId}/sources/upload`, form, "reviewer-1");
    if (uploaded.status !== 201) {
      fail("Upload field notebook source", `${uploaded.status} ${String(uploaded.text).slice(0, 300)}`);
      return;
    }

    source = uploaded.json;
    if (source?.filePath && source?.originalName) {
      ok("Upload field notebook source", `${source.kind} ${source.originalName}`);
    } else {
      fail("Upload field notebook source", `missing file metadata ${String(uploaded.text).slice(0, 300)}`);
      return;
    }
  }

  const processed = await api("POST", `/sources/${source.id}/process`, { async: true }, "reviewer-1");
  if (processed.status !== 202) {
    fail("Start uploaded source extraction", `${processed.status} ${String(processed.text).slice(0, 500)}`);
    return;
  }

  ok("Start uploaded source extraction", `${source.title} queued`);
  const finalSource = await waitForSourceProcessed(languageId, source.id, "Uploaded source extraction");
  if (!finalSource) return;
  ok(
    "Uploaded source extraction",
    `${finalSource.summary ?? "processed"}${finalSource.warnings?.length ? `, ${finalSource.warnings.length} warnings` : ""}`
  );
  await acceptProposedDraftsForSource(languageId, source.id, "Accept uploaded source drafts");
}

export async function ensureDiscourseGrounding(languageId) {
  if (await hasLexemeForm(languageId, "poku")) {
    skip("Discourse grounding source", "poku already in lexicon");
    return;
  }

  await processModelSource(languageId, DISCOURSE_GROUNDING_SOURCE_TITLE, DISCOURSE_GROUNDING_SOURCE_TEXT, {
    async: true
  });
}

export async function ensureCommandGrounding(languageId) {
  if (await hasLexemeForm(languageId, "-ne")) {
    skip("Command grounding source", "-ne already in lexicon");
    return;
  }

  await processModelSource(languageId, COMMAND_GROUNDING_SOURCE_TITLE, COMMAND_GROUNDING_SOURCE_TEXT, { async: true });
}
