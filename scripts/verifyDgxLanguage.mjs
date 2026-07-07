/**
 * End-to-end verification: custom language + DGX-backed LLM flows.
 * Run while `npm run dev` is up on :4321 with DGX config in .env.
 */
const API = process.env.ASSINI_API_URL ?? "http://127.0.0.1:4321";
const AUTH = {
  "content-type": "application/json",
  "x-assini-user-id": process.env.ASSINI_TEST_USER ?? "reviewer-1",
  "x-assini-dev-token": process.env.ASSINI_DEV_AUTH_TOKEN ?? "dev-local"
};

const results = [];

function pass(label, detail = "") {
  results.push({ ok: true, label, detail });
  console.log(`PASS  ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, detail = "") {
  results.push({ ok: false, label, detail });
  console.error(`FAIL  ${label}${detail ? `: ${detail}` : ""}`);
}

async function api(method, path, body) {
  const init = { method, headers: { ...AUTH } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${API}${path}`, init);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, json, text };
}

async function main() {
  console.log(`\n=== DGX language verification @ ${API} ===\n`);

  // 1. LLM status
  const status = await api("GET", "/llm/status");
  if (status.status !== 200 || !status.json?.configured) {
    fail("LLM status", `${status.status} ${status.text?.slice(0, 200)}`);
    summarize();
    process.exit(1);
  }
  pass("LLM status", `${status.json.provider} @ ${status.json.baseUrl?.slice(0, 40)}…`);

  // 2. Health check runs later with programmer role (reviewer gets 403)

  // 3. Create custom test language
  const langName = `SparkVeridian-${Date.now().toString(36)}`;
  const createLang = await api("POST", "/languages", {
    name: langName,
    description: "Synthetic agglutinative language for DGX Spark integration testing. Uses CV syllables and -na/-ko suffixes.",
    orthography: "Latin lowercase; hyphen joins morphemes (e.g. mira-na-ko).",
    typology: "agglutinative",
    phonology: {
      consonants: ["m", "s", "k", "r", "t", "l", "n"],
      vowels: ["a", "i", "u"],
      syllableTemplate: "CV",
      stress: "penultimate",
      notes: ["Created by verifyDgxLanguage.mjs"]
    }
  });
  if (createLang.status !== 201) {
    fail("Create language", `${createLang.status} ${createLang.text?.slice(0, 300)}`);
    summarize();
    process.exit(1);
  }
  const language = createLang.json;
  pass("Create language", `${language.id} (${language.name})`);

  // 4. Register wordlist source
  const register = await api("POST", `/languages/${language.id}/sources`, {
    kind: "wordlist",
    title: "SparkVeridian seed lexicon",
    rawText: [
      "mira = river / water",
      "saku = child / young one",
      "talo = walk / move on foot",
      "kora = speak / say",
      "mira talo-na = I walk by the river",
      "saku kora-ko = the child speaks",
      "luma = star / light in sky",
      "veri = green / living growth"
    ].join("\n")
  });
  if (register.status !== 201) {
    fail("Register source", `${register.status} ${register.text?.slice(0, 300)}`);
    summarize();
    process.exit(1);
  }
  const source = register.json;
  pass("Register source", source.id);

  // 5. Process source with live LLM
  console.log("      processing source via LLM (may take up to 120s)…");
  const processed = await api("POST", `/sources/${source.id}/process`, {});
  if (processed.status !== 200) {
    fail("Process source", `${processed.status} ${processed.text?.slice(0, 400)}`);
  } else {
    const draftCount = processed.json?.drafts?.length ?? 0;
    const providerUsed = processed.json?.warnings?.find((w) => w.includes("provider")) ?? "";
    if (draftCount >= 1) {
      pass("Process source (LLM)", `${draftCount} drafts${providerUsed ? `; ${providerUsed}` : ""}`);
    } else {
      fail("Process source (LLM)", `0 drafts; warnings: ${JSON.stringify(processed.json?.warnings ?? [])}`);
    }
  }

  // 6. AI session — programmer_debug tests chat completion
  console.log("      AI session programmer_debug (may take up to 60s)…");
  const programmerAuth = { ...AUTH, "x-assini-user-id": "programmer-1" };
  async function apiAsProgrammer(method, path, body) {
    const init = { method, headers: { ...programmerAuth } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(`${API}${path}`, init);
    const text = await response.text();
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
    return { status: response.status, json, text };
  }

  const healthProg = await apiAsProgrammer("POST", "/llm/health-check", {});
  if (healthProg.status === 200 && healthProg.json?.reachable) {
    pass("LLM health-check (programmer)", `${healthProg.json.latencyMs}ms`);
  } else {
    fail("LLM health-check", JSON.stringify(healthProg.json ?? healthProg.text).slice(0, 300));
  }

  const ai = await apiAsProgrammer("POST", "/ai/sessions", {
    languageId: language.id,
    mode: "programmer_debug",
    seedPrompt: `In one short sentence, describe the phonology of ${langName} using only the letters m,s,k,r,t,l,n and vowels a,i,u.`,
    contextNoteIds: [],
    contextPassageIds: []
  });
  if (ai.status !== 201) {
    fail("AI session", `${ai.status} ${ai.text?.slice(0, 400)}`);
  } else {
    const assistantMsg = ai.json?.messages?.find((m) => m.role === "assistant");
    const content = typeof assistantMsg?.content === "string" ? assistantMsg.content.trim() : "";
    if (content.length > 10 && !content.startsWith("[deterministic")) {
      pass("AI session (live model)", content.slice(0, 120));
    } else {
      fail("AI session (live model)", `empty or fallback: ${content.slice(0, 200)}`);
    }
  }

  // 7. Accept one lexeme draft if available
  const drafts = processed.json?.drafts ?? [];
  const lexemeDraft = drafts.find((d) => d.kind === "lexeme");
  if (lexemeDraft) {
    const accept = await api("POST", `/extraction-drafts/${lexemeDraft.id}/accept`, {});
    if (accept.status === 200) {
      pass("Accept lexeme draft", lexemeDraft.payload?.form ?? lexemeDraft.id);
    } else {
      fail("Accept lexeme draft", `${accept.status}`);
    }
  }

  // 8. Exercise generate preview (needs some lexicon — may 422 if empty)
  if (lexemeDraft) {
    console.log("      exercise generate preview…");
    const exGen = await api("POST", `/languages/${language.id}/exercises/generate`, { type: "translation" });
    if (exGen.status === 200 && exGen.json?.exercise?.prompt) {
      pass("Exercise generate", exGen.json.exercise.prompt.slice(0, 80));
    } else if (exGen.status === 422) {
      pass("Exercise generate", "422 grounding (expected with minimal lexicon)");
    } else {
      fail("Exercise generate", `${exGen.status} ${exGen.text?.slice(0, 200)}`);
    }
  }

  // 9. Verify language appears in list
  const langs = await api("GET", "/languages");
  if (langs.status === 200 && langs.json?.some((l) => l.id === language.id)) {
    pass("Language listed", language.id);
  } else {
    fail("Language listed");
  }

  summarize();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function summarize() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
