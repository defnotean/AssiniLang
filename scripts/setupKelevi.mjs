// Builds "Kelevi", a fully synthetic test language, through the live API.
// Exercises the real pipeline end to end: language creation, wordlist and
// text ingestion (model-backed when ASSINI_LLM_* is configured), bulk draft
// review, validated corpus imports with full segmentation, model-backed
// grammar-note drafting with grounding scores, exercise authoring, grading,
// spaced-repetition recommendations, and an evaluation run.
//
// Usage:  node scripts/setupKelevi.mjs
// Env:    ASSINI_API_URL (default http://127.0.0.1:4321)
//         ASSINI_DEV_AUTH_TOKEN (must match the running API)

const BASE = process.env.ASSINI_API_URL ?? "http://127.0.0.1:4321";
const TOKEN = process.env.ASSINI_DEV_AUTH_TOKEN ?? "dev-local";
const auth = { "x-assini-user-id": "reviewer-1", "x-assini-dev-token": TOKEN, "content-type": "application/json" };

async function call(method, path, body, headers = auth) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

function expect(label, result, expected) {
  if (result.status !== expected) {
    console.error(
      `FAIL ${label}: expected ${expected}, got ${result.status}:`,
      JSON.stringify(result.body).slice(0, 500)
    );
    process.exit(1);
  }
  console.log(`ok   ${label} (${result.status})`);
  return result.body;
}

// --- 0. Provider status -----------------------------------------------------
const llmStatus = expect("GET /llm/status", await call("GET", "/llm/status"), 200);
console.log(`     provider mode: ${llmStatus.mode ?? JSON.stringify(llmStatus).slice(0, 160)}`);
const health = await call("POST", "/llm/health-check", {}, { ...auth, "x-assini-user-id": "programmer-1" });
console.log(`     health-check: ${health.status}`, JSON.stringify(health.body).slice(0, 200));

// --- 1. Create the language -------------------------------------------------
const language = expect(
  "create language Kelevi",
  await call("POST", "/languages", {
    name: "Kelevi",
    description:
      "Fully synthetic agglutinative test language invented for pipeline testing. No relationship to any real language community.",
    orthography: "Lowercase Latin. Suffixes concatenate directly onto roots (no hyphens).",
    typology: "agglutinative",
    phonology: {
      consonants: ["t", "k", "s", "m", "n", "l", "r", "v", "p"],
      vowels: ["a", "e", "i", "o", "u"],
      syllableTemplate: "CV",
      stress: "word-initial",
      notes: ["Strict CV syllables.", "No consonant clusters or codas."]
    }
  }),
  201
);
console.log(`     language id: ${language.id}`);

// --- 2. Ingest the core wordlist (roots + bound morphemes) ------------------
const wordlist = expect(
  "register wordlist source",
  await call("POST", `/languages/${language.id}/sources`, {
    kind: "wordlist",
    title: "Kelevi core lexicon (synthetic)",
    rawText: [
      "talu = water",
      "keri = fish",
      "nuka = house",
      "lema = sun",
      "seli = child",
      "miru = bird",
      "moka = eat",
      "siva = see",
      "rino = walk",
      "pelu = swim",
      "ka = plural marker",
      "ne = locative case marker",
      "su = possessive marker",
      "mi = present tense",
      "ru = past tense",
      "an = first person singular",
      "es = second person singular",
      "o = third person singular"
    ].join("\n")
  }),
  201
);

const processedWordlist = expect("process wordlist", await call("POST", `/sources/${wordlist.id}/process`, {}), 200);
console.log(`     drafts: ${processedWordlist.drafts.length}, warnings: ${JSON.stringify(processedWordlist.warnings)}`);

// --- 3. Bulk-accept the lexeme drafts ---------------------------------------
const draftList = expect(
  "list proposed drafts",
  await call("GET", `/languages/${language.id}/extraction-drafts?status=proposed`),
  200
);
const lexemeDraftIds = draftList.filter((draft) => draft.kind === "lexeme").map((draft) => draft.id);
const bulk = expect(
  `bulk-accept ${lexemeDraftIds.length} lexeme drafts`,
  await call("POST", `/languages/${language.id}/extraction-drafts/bulk-review`, {
    action: "accept",
    draftIds: lexemeDraftIds.slice(0, 50)
  }),
  200
);
console.log(`     accepted: ${bulk.accepted}, failed: ${bulk.failed}`);

// --- 4. Ingest a narrative text source (model extraction when configured) ---
const story = expect(
  "register text source",
  await call("POST", `/languages/${language.id}/sources`, {
    kind: "text",
    title: "Kelevi field sentences (synthetic)",
    rawText: [
      "seli talune pelumio = the child swims in the water",
      "kerika talune pelumio = the fish swim in the water",
      "selika nukane mokamio = the children eat in the house",
      "miru lemane sivamio = the bird sees in the sun",
      "selisu miru rinorus = your child's bird walked"
    ].join("\n")
  }),
  201
);
const processedStory = expect("process text source", await call("POST", `/sources/${story.id}/process`, {}), 200);
console.log(`     drafts: ${processedStory.drafts.length}, warnings: ${JSON.stringify(processedStory.warnings)}`);

// --- 5. Import three fully segmented corpus passages ------------------------
const passages = [
  {
    textTarget: "seli talune pelumio",
    textTranslation: "The child swims in the water.",
    segmentation: [
      { surface: "seli", lemma: "seli", gloss: "child", features: ["noun"] },
      { surface: "talu", lemma: "talu", gloss: "water", features: ["noun"] },
      { surface: "ne", lemma: "ne", gloss: "LOC", features: ["case:locative"] },
      { surface: "pelu", lemma: "pelu", gloss: "swim", features: ["verb"] },
      { surface: "mi", lemma: "mi", gloss: "PRS", features: ["tense:present"] },
      { surface: "o", lemma: "o", gloss: "3SG", features: ["person:third-singular"] }
    ]
  },
  {
    textTarget: "selika nukane mokamio",
    textTranslation: "The children eat in the house.",
    segmentation: [
      { surface: "seli", lemma: "seli", gloss: "child", features: ["noun"] },
      { surface: "ka", lemma: "ka", gloss: "PL", features: ["number:plural"] },
      { surface: "nuka", lemma: "nuka", gloss: "house", features: ["noun"] },
      { surface: "ne", lemma: "ne", gloss: "LOC", features: ["case:locative"] },
      { surface: "moka", lemma: "moka", gloss: "eat", features: ["verb"] },
      { surface: "mi", lemma: "mi", gloss: "PRS", features: ["tense:present"] },
      { surface: "o", lemma: "o", gloss: "3SG", features: ["person:third-singular"] }
    ]
  },
  {
    textTarget: "miru lemane sivamian",
    textTranslation: "I see the bird in the sun.",
    segmentation: [
      { surface: "miru", lemma: "miru", gloss: "bird", features: ["noun"] },
      { surface: "lema", lemma: "lema", gloss: "sun", features: ["noun"] },
      { surface: "ne", lemma: "ne", gloss: "LOC", features: ["case:locative"] },
      { surface: "siva", lemma: "siva", gloss: "see", features: ["verb"] },
      { surface: "mi", lemma: "mi", gloss: "PRS", features: ["tense:present"] },
      { surface: "an", lemma: "an", gloss: "1SG", features: ["person:first-singular"] }
    ]
  }
];

for (const [index, passage] of passages.entries()) {
  expect(
    `import corpus passage ${index + 1}`,
    await call("POST", `/languages/${language.id}/corpus`, {
      textTarget: passage.textTarget,
      textTranslation: passage.textTranslation,
      source: "Synthetic Kelevi test corpus",
      sourceMetadata: {
        author: "Kelevi setup script",
        year: 2026,
        license: "Internal synthetic test data",
        consentRecord: "synthetic-test-only"
      },
      topicTags: [`kelevi-passage-${index + 1}`],
      morphologicalSegmentation: passage.segmentation,
      consentStatus: { use: "testing-only", restrictions: ["synthetic-test-fixture"] }
    }),
    201
  );
}

// --- 6. Model-backed grammar-note drafting (grounding scores) ---------------
const modelDraft = await call("POST", `/languages/${language.id}/study-loop/model-draft`, {});
if (modelDraft.status === 200) {
  console.log(`ok   model-draft notes generated: ${modelDraft.body.generated}`);
  for (const note of modelDraft.body.notes ?? []) {
    const grounding = note.grounding
      ? `${Math.round(note.grounding.score * 100)}% [${note.grounding.failures.join("; ") || "no failures"}]`
      : "n/a";
    console.log(`     - "${note.topic}" grounding: ${grounding}`);
  }
} else {
  console.log(`note model-draft skipped (${modelDraft.status}): ${JSON.stringify(modelDraft.body).slice(0, 200)}`);
  const deterministic = expect("deterministic study-loop draft", await call("POST", "/study-loop/draft", {}), 200);
  console.log(`     deterministic drafts created: ${JSON.stringify(deterministic).slice(0, 120)}`);
}

// --- 7. Author an exercise, grade an answer, get recommendations ------------
const notes = expect("list notes", await call("GET", `/languages/${language.id}/notes`), 200);
if (notes.length === 0) {
  console.error("FAIL: no notes available to ground the exercise's allowedRuleIds");
  process.exit(1);
}

const exercise = expect(
  "author exercise",
  await call("POST", `/languages/${language.id}/exercises`, {
    type: "translate_to_english",
    prompt: "Translate into English: seli talune pelumio",
    allowedVocabulary: ["seli", "talu", "ne", "pelu", "mi", "o"],
    allowedRuleIds: [notes[0].id],
    expectedAnswers: ["The child swims in the water.", "the child swims in the water"],
    adversarialAnswers: [
      { answer: "The fish swims in the water.", reason: "Wrong subject: keri means fish, seli means child." },
      { answer: "The child swam in the water.", reason: "Wrong tense: mi marks present, ru marks past." }
    ],
    gradingExplanation: "seli=child, talu-ne=water-LOC, pelu-mi-o=swim-PRS-3SG."
  }),
  201
);

const submission = expect(
  "grade learner answer",
  await call(
    "POST",
    `/exercises/${exercise.id}/submissions`,
    { answer: "the child swims in the water" },
    { ...auth, "x-assini-user-id": "learner-1" }
  ),
  200
);
console.log(`     accepted: ${submission.accepted} - ${String(submission.explanation).slice(0, 120)}`);

const recommended = expect(
  "practice recommendations",
  await call("GET", `/languages/${language.id}/exercises/recommended`, undefined, {
    ...auth,
    "x-assini-user-id": "learner-1"
  }),
  200
);
console.log(`     recommended: ${recommended.exercises.length}, first status: ${recommended.rationale[0]?.status}`);

// --- 8. Evaluation run + profile summary ------------------------------------
const evaluationResult = await call("POST", "/evaluations/run", {});
if (evaluationResult.status !== 200 && evaluationResult.status !== 201) {
  console.error(
    `FAIL run evaluation: got ${evaluationResult.status}:`,
    JSON.stringify(evaluationResult.body).slice(0, 300)
  );
  process.exit(1);
}
console.log(`ok   run evaluation (${evaluationResult.status})`);
const evaluation = evaluationResult.body;
const run = Array.isArray(evaluation) ? evaluation[0] : evaluation;
console.log(`     eval summary: ${String(run?.summary ?? JSON.stringify(evaluation)).slice(0, 200)}`);

const profile = expect("language profile", await call("GET", `/languages/${language.id}/profile`), 200);
console.log(`     stats: ${JSON.stringify(profile.stats)}`);
console.log(`     morphemes derived: ${profile.morphemeInventory?.length ?? 0}`);
console.log(`     paradigm gaps: ${(profile.paradigmGaps ?? []).length}`);
for (const gap of (profile.paradigmGaps ?? []).slice(0, 5)) {
  console.log(
    `     - ${gap.lemma} [${gap.dimension}] attested: ${gap.attested.join(",")} missing: ${gap.missing.join(",")}`
  );
}

console.log("\nKELEVI SETUP COMPLETE");
