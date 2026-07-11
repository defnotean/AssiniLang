/**
 * Build a full Veridspark conlang in the live workspace via API + DGX LLM.
 * Requires: npm run dev on :4321, DGX reachable, ASSINI_DEV_AUTH_TOKEN in .env
 */
const API = process.env.ASSINI_API_URL ?? "http://127.0.0.1:4321";
const AUTH = {
  "content-type": "application/json",
  "x-assini-user-id": "reviewer-1",
  "x-assini-dev-token": process.env.ASSINI_DEV_AUTH_TOKEN ?? "dev-local"
};

const META = {
  author: "Veridspark Builder",
  year: 2026,
  license: "community-conlang",
  consentRecord: "synthetic-veridspark-v1"
};

const CONSENT = { use: "community-approved", restrictions: ["prototype-study"] };

async function api(method, path, body) {
  const init = { method, headers: { ...AUTH } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

async function processSourceWithRetry(sourceId, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const res = await api("POST", `/sources/${sourceId}/process`, {});
    if (res.status === 200) return res;
    if (i < attempts) {
      console.log(`      retry ${i}/${attempts - 1} after process error…`);
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      return res;
    }
  }
}

async function bulkAcceptDrafts(langId, drafts) {
  const proposed = drafts.filter((d) => d.status === "proposed");
  if (proposed.length === 0) return 0;
  const bulk = await api("POST", `/languages/${langId}/extraction-drafts/bulk-review`, {
    action: "accept",
    draftIds: proposed.map((d) => d.id)
  });
  return bulk.json?.results?.filter((r) => r.ok).length ?? 0;
}

function chunkWordlist(text, size = 14) {
  const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  const chunks = [];
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size).join("\n"));
  }
  return chunks;
}

function seg(parts) {
  return parts.map(([surface, lemma, gloss, features]) => ({
    surface,
    lemma,
    gloss,
    features: Array.isArray(features) ? features : [features]
  }));
}

// ─── Language design ───────────────────────────────────────────────────────────

const LANGUAGE = {
  name: "Veridspark",
  description:
    "Veridspark is a constructed agglutinative language documented for AssiniLang integration testing. " +
    "It uses open syllables (C)V with an optional coda, penultimate stress, and SOV clause order. " +
    "Verbs take tense (-lo past, -mi present, -fu future) and person suffixes (-na 1sg, -ta 2sg, -ki 3sg, -mu 1pl). " +
    "The locative -ke marks place; -ko nominalizes verbs. Negation uses the particle ma before the verb.",
  orthography:
    "Latin lowercase; morpheme boundaries marked with hyphens on affixes (e.g. talo-mi-na = walk-PRES-1SG). " +
    "Only letters p t k m n s l r v and vowels a e i o u appear in native roots.",
  typology: "agglutinative",
  phonology: {
    consonants: ["p", "t", "k", "m", "n", "s", "l", "r", "v"],
    vowels: ["a", "e", "i", "o", "u"],
    syllableTemplate: "(C)V(C)",
    stress: "penultimate",
    notes: [
      "No consonant clusters within native roots.",
      "Loanwords are avoided in the core corpus.",
      "Hyphen marks bound morphology in writing."
    ]
  }
};

const WORDLIST = `
# Veridspark core lexicon (roots)
mira = river
saku = child
talo = walk
kora = speak / say
luma = star
veri = green / living
nemi = teach
raki = eat
silu = sleep
katu = house
toru = water (drinking)
piru = sky
mara = mother
tara = father
vira = heart
liru = song
lira = sing
sora = see / look
kira = give
naru = come
taru = go
miru = think
savu = learn
ruma = night
kuma = day
laka = tree
vaku = fire
sira = wind
tenu = stone
kalu = name
paru = field
niru = friend
kali = path / road
suri = river-bank
vima = mountain
rako = big
sima = small
tiru = good
varu = bad

# Bound morphology (affixes)
-na = first person singular
-ta = second person singular
-ki = third person singular
-mu = first person plural
-lo = past tense
-mi = present tense
-fu = future tense
-ke = locative case
-ko = nominalizer
-ma = negation particle
`.trim();

const GRAMMAR_DOC = `
Veridspark Grammar Reference (v1)

1. Phonology
Inventory: p t k m n s l r v + a i u. Stress falls on the penultimate syllable.
Writing uses hyphens before affixes attached to a verb or noun stem.

2. Word order
Basic transitive clauses are SOV: Subject Object Verb.
Example: saku mira sora-mi-ki = child river see-PRES-3SG ("The child sees the river.")

3. Verbal morphology
Verb stems are followed by tense then person: STEM-TENSE-PERSON.
talo-mi-na = I walk (present)
talo-lo-ki = he/she walked (past)
talo-fu-mu = we will walk (future)

4. Locative -ke
Attach -ke to nouns for location: mira-ke = at the river, katu-ke = at the house.

5. Negation
Place ma immediately before the verb complex: saku ma talo-mi-ki = the child does not walk.

6. Nominalization -ko
Verbs can become nouns: talo-ko = walking / the act of walking.

7. Possession
Possessor precedes possessed noun without extra marking in simple cases: mara saku = mother child ("mother's child" / the mother's child).

8. Questions
Yes-no questions add the particle vi at clause end (uninflected): saku talo-mi-ki vi

9. Plural
Collective plurality can use reduplication of the first syllable in poetic registers; prose uses quantifiers (not in core lexicon yet).

10. Honorific register
Add -ri after person suffix in formal speech: kora-mi-na-ri = I speak (respectful).
`.trim();

const CORPUS = [
  {
    textTarget: "saku talo-mi-ki",
    textTranslation: "The child walks.",
    tags: ["motion", "present"],
    morphemes: seg([
      ["saku", "saku", "child", "noun"],
      ["talo", "talo", "walk", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ])
  },
  {
    textTarget: "mara kora-lo-na",
    textTranslation: "I spoke to mother.",
    tags: ["speech", "past", "first-person"],
    morphemes: seg([
      ["mara", "mara", "mother", "noun"],
      ["kora", "kora", "speak", "verb-root"],
      ["-lo", "-lo", "past", "tense"],
      ["-na", "-na", "1sg", "person"]
    ])
  },
  {
    textTarget: "mira-ke talo-mi-na",
    textTranslation: "I walk at the river.",
    tags: ["motion", "locative", "first-person"],
    morphemes: seg([
      ["mira-ke", "mira", "river.loc", ["noun", "locative"]],
      ["talo", "talo", "walk", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-na", "-na", "1sg", "person"]
    ])
  },
  {
    textTarget: "saku raki-mi-ki luma-ke",
    textTranslation: "The child eats at the star camp.",
    tags: ["food", "locative"],
    morphemes: seg([
      ["saku", "saku", "child", "noun"],
      ["raki", "raki", "eat", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["luma-ke", "luma", "star.loc", ["noun", "locative"]]
    ])
  },
  {
    textTarget: "niru nemi-lo-mu",
    textTranslation: "We taught (our) friend.",
    tags: ["learning", "past", "first-person-plural"],
    morphemes: seg([
      ["niru", "niru", "friend", "noun"],
      ["nemi", "nemi", "teach", "verb-root"],
      ["-lo", "-lo", "past", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ])
  },
  {
    textTarget: "katu-ke silu-mi-ki ruma",
    textTranslation: "At the house he sleeps (at) night.",
    tags: ["rest", "locative", "time"],
    morphemes: seg([
      ["katu-ke", "katu", "house.loc", ["noun", "locative"]],
      ["silu", "silu", "sleep", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["ruma", "ruma", "night", "noun"]
    ])
  },
  {
    textTarget: "saku ma talo-mi-ki",
    textTranslation: "The child does not walk.",
    tags: ["negation", "motion"],
    morphemes: seg([
      ["saku", "saku", "child", "noun"],
      ["ma", "ma", "neg", "particle"],
      ["talo", "talo", "walk", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ])
  },
  {
    textTarget: "vira kira-lo-na tara",
    textTranslation: "I gave heart (love) to father.",
    tags: ["emotion", "past"],
    morphemes: seg([
      ["vira", "vira", "heart", "noun"],
      ["kira", "kira", "give", "verb-root"],
      ["-lo", "-lo", "past", "tense"],
      ["-na", "-na", "1sg", "person"],
      ["tara", "tara", "father", "noun"]
    ])
  },
  {
    textTarget: "vima-ke sora-mi-mu piru",
    textTranslation: "We see the sky from the mountain.",
    tags: ["perception", "locative"],
    morphemes: seg([
      ["vima-ke", "vima", "mountain.loc", ["noun", "locative"]],
      ["sora", "sora", "see", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-mu", "-mu", "1pl", "person"],
      ["piru", "piru", "sky", "noun"]
    ])
  },
  {
    textTarget: "liru lira-mi-ki kali-ke",
    textTranslation: "He sings the song on the path.",
    tags: ["music", "locative"],
    morphemes: seg([
      ["liru", "liru", "song", "noun"],
      ["lira", "lira", "sing", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["kali-ke", "kali", "path.loc", ["noun", "locative"]]
    ])
  },
  {
    textTarget: "veri laka sora-mi-ki",
    textTranslation: "He sees the green tree.",
    tags: ["nature", "description"],
    morphemes: seg([
      ["veri", "veri", "green", "adjective"],
      ["laka", "laka", "tree", "noun"],
      ["sora", "sora", "see", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ])
  },
  {
    textTarget: "kalu savu-mi-na",
    textTranslation: "I learn (the) names.",
    tags: ["learning", "first-person"],
    morphemes: seg([
      ["kalu", "kalu", "name", "noun"],
      ["savu", "savu", "learn", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-na", "-na", "1sg", "person"]
    ])
  }
];

const NARRATIVE = `
Veridspark field narrative — The walk to the river

mara saku kali-ke talo-mi-ki mira-ke.
Mother and the child walk on the path to the river.

saku toru raki-mi-ki suri-ke.
The child drinks water at the river-bank.

mara liru kora-mi-na saku.
Mother sings; I speak to the child.

ruma naru-fu-ki katu-ke.
Night will come; he returns to the house.

saku silu-lo-ki vira tiru.
The child slept well — a good heart.

Word list for this text:
kali = path, suri = river-bank, toru = drinking water, naru = come
`.trim();

// ─── Main build ──────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Building Veridspark conlang ===\n");
  const stats = { lexemes: 0, corpus: 0, notes: 0, exercises: 0, drafts: 0 };

  // 1. Resolve language (reuse latest Veridspark or create)
  const langs0 = await api("GET", "/languages");
  const existing = (langs0.json ?? [])
    .filter((l) => l.name === "Veridspark")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];

  let langId;
  if (existing) {
    langId = existing.id;
    console.log(`Using existing language: ${langId}`);
    await api("PATCH", `/languages/${langId}`, {
      phonology: LANGUAGE.phonology,
      description: LANGUAGE.description,
      orthography: LANGUAGE.orthography.replace("a i u", "a e i o u")
    });
  } else {
    const langRes = await api("POST", "/languages", {
      ...LANGUAGE,
      orthography: LANGUAGE.orthography.replace("a i u", "a e i o u")
    });
    if (langRes.status !== 201) {
      console.error("Create language failed:", langRes.status, langRes.text?.slice(0, 400));
      process.exit(1);
    }
    langId = langRes.json.id;
    console.log(`Created language: ${langId}`);
  }

  const lexBefore = await api("GET", `/languages/${langId}/lexicon`);
  const corpBefore = await api("GET", `/languages/${langId}/corpus`);
  const skipLexicon = (lexBefore.json?.length ?? 0) >= 35;
  if (skipLexicon) {
    stats.lexemes = lexBefore.json.length;
    console.log(`\n[2/5] Lexicon skipped (${stats.lexemes} lexemes already present)`);
  }

  // 2. Import hand-crafted corpus first (works before lexicon exists)
  console.log("\n[1/5] Corpus passages (12 annotated texts)…");
  for (const [i, passage] of CORPUS.entries()) {
    const res = await api("POST", `/languages/${langId}/corpus`, {
      source: "veridspark-corpus-v1",
      sourceMetadata: META,
      textTarget: passage.textTarget,
      textTranslation: passage.textTranslation,
      morphologicalSegmentation: passage.morphemes,
      topicTags: passage.tags,
      consentStatus: CONSENT
    });
    if (res.status === 201) {
      stats.corpus++;
    } else if (res.status === 409 || String(res.json?.error ?? "").includes("Duplicate")) {
      console.log(`      skip duplicate passage ${i + 1}`);
      stats.corpus++;
    } else {
      console.warn(`      passage ${i + 1} failed (${res.status}):`, res.json?.error ?? res.text?.slice(0, 200));
    }
  }
  console.log(`      ${stats.corpus} corpus passages`);

  // 3. Lexicon via chunked DGX extraction
  if (!skipLexicon) {
    console.log("\n[2/5] Lexicon via DGX (chunked wordlists)…");
    const chunks = chunkWordlist(WORDLIST, 12);
    for (const [i, chunk] of chunks.entries()) {
      const srcLex = await api("POST", `/languages/${langId}/sources`, {
        kind: "wordlist",
        title: `Veridspark lexicon chunk ${i + 1}/${chunks.length}`,
        rawText: chunk
      });
      if (srcLex.status !== 201) continue;
      console.log(`      processing chunk ${i + 1}/${chunks.length}…`);
      const procLex = await processSourceWithRetry(srcLex.json.id);
      if (procLex.status !== 200) {
        console.warn(`      chunk ${i + 1} failed:`, procLex.json?.error ?? procLex.status);
        continue;
      }
      const accepted = await bulkAcceptDrafts(
        langId,
        (procLex.json?.drafts ?? []).filter((d) => d.kind === "lexeme")
      );
      stats.lexemes += accepted;
      console.log(`      chunk ${i + 1}: ${accepted} lexemes`);
    }
  }

  // Skip grammar/narrative if notes already plentiful
  const notesBefore = await api("GET", `/languages/${langId}/notes`);
  const skipNotes = (notesBefore.json?.length ?? 0) >= 6;

  // 4. Grammar doc → LLM → accept grammar notes
  if (!skipNotes) {
    console.log("\n[3/5] Grammar notes via DGX extraction…");
    const srcGram = await api("POST", `/languages/${langId}/sources`, {
      kind: "text",
      title: "Veridspark grammar reference",
      rawText: GRAMMAR_DOC
    });
    if (srcGram.status === 201) {
      console.log("      processing grammar doc…");
      const procGram = await processSourceWithRetry(srcGram.json.id);
      if (procGram.status === 200) {
        stats.notes += await bulkAcceptDrafts(
          langId,
          (procGram.json?.drafts ?? []).filter((d) => d.kind === "grammar_note")
        );
        stats.corpus += await bulkAcceptDrafts(
          langId,
          (procGram.json?.drafts ?? []).filter((d) => d.kind === "corpus_passage")
        );
        console.log(`      grammar extraction: ${stats.notes} notes so far`);
      }
    }

    // 5. Narrative → LLM → accept extra corpus + notes
    console.log("\n[4/5] Narrative enrichment via DGX…");
    const srcNar = await api("POST", `/languages/${langId}/sources`, {
      kind: "text",
      title: "Veridspark river walk narrative",
      rawText: NARRATIVE
    });
    if (srcNar.status === 201) {
      console.log("      processing narrative…");
      const procNar = await processSourceWithRetry(srcNar.json.id);
      if (procNar.status === 200) {
        const ok = await bulkAcceptDrafts(langId, procNar.json?.drafts ?? []);
        console.log(`      ${ok} narrative drafts accepted`);
      }
    }

    // Model-backed grammar notes from approved data
    const modelDraft = await api("POST", `/languages/${langId}/study-loop/model-draft`, { languageId: langId });
    if (modelDraft.status === 200) {
      stats.notes += modelDraft.json?.generated ?? 0;
      console.log(
        `      model-draft: ${modelDraft.json?.generated ?? 0} notes (${modelDraft.json?.warnings?.length ?? 0} warnings)`
      );
    }
  }

  // Approve draft notes for exercises
  const notesRes = await api("GET", `/languages/${langId}/notes`);
  const draftNotes = (notesRes.json ?? []).filter((n) => n.status === "draft");
  for (const note of draftNotes.slice(0, 12)) {
    await api("PATCH", `/notes/${note.id}/review`, { status: "approved", explanation: note.explanation });
  }
  const approvedNotes = (await api("GET", `/languages/${langId}/notes`)).json ?? [];
  stats.notes = approvedNotes.length;

  // 6. Exercises
  console.log("\n[5/5] Authoring exercises…");
  const lex = await api("GET", `/languages/${langId}/lexicon`);
  const forms = (lex.json ?? []).map((l) => l.form);
  const ruleIds = approvedNotes.slice(0, 6).map((n) => n.id);
  const noteOrder = ruleIds[0] ?? "syntax/basic-order";

  const exerciseDefs = [
    {
      type: "choose_particle",
      prompt: "Choose the first-person present suffix that completes talo-___.",
      allowedVocabulary: ["-mi", "-lo", "-na", "-ki"],
      allowedRuleIds: [noteOrder],
      expectedAnswers: ["-na"],
      adversarialAnswers: [
        { answer: "-ki", reason: "Third person, not first." },
        { answer: "-lo", reason: "Tense suffix, not person." }
      ],
      gradingExplanation: "Present tense uses -mi before person; first person singular is -na."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: saku talo-mi-ki",
      allowedVocabulary: forms.filter((f) => "saku talo-mi-ki".includes(f.replace(/^-/, ""))).slice(0, 8),
      allowedRuleIds: ruleIds.slice(0, 2),
      expectedAnswers: ["The child walks."],
      adversarialAnswers: [
        { answer: "The child walked.", reason: "Wrong tense — -mi is present." },
        { answer: "I walk.", reason: "Wrong subject and person." }
      ],
      gradingExplanation: "SOV order: saku (child) + talo-mi-ki (walks)."
    },
    {
      type: "translate_to_target",
      prompt: "Translate into Veridspark: I walk at the river.",
      allowedVocabulary: ["mira-ke", "mira", "talo", "-mi", "-na", "-ke"],
      allowedRuleIds: ruleIds.slice(0, 3),
      expectedAnswers: ["mira-ke talo-mi-na"],
      adversarialAnswers: [
        { answer: "mira talo-mi-na", reason: "Missing locative -ke on river." },
        { answer: "mira-ke talo-lo-na", reason: "Wrong tense — should be present -mi." }
      ],
      gradingExplanation: "Locative mira-ke + SOV with talo-mi-na."
    },
    {
      type: "segment",
      prompt: "Segment the verb in: mara kora-lo-na",
      allowedVocabulary: ["kora", "-lo", "-na"],
      allowedRuleIds: ruleIds.slice(0, 2),
      expectedAnswers: ["kora-lo-na"],
      adversarialAnswers: [
        { answer: "kora-na", reason: "Missing past tense -lo." },
        { answer: "mara kora-lo-na", reason: "Only the verb complex is requested." }
      ],
      gradingExplanation: "Verb stem kora + past -lo + 1sg -na."
    },
    {
      type: "choose_particle",
      prompt: "Which particle marks negation before the verb?",
      allowedVocabulary: ["ma", "vi", "-ke", "-ko"],
      allowedRuleIds: ruleIds.slice(0, 3),
      expectedAnswers: ["ma"],
      adversarialAnswers: [
        { answer: "vi", reason: "Question particle, not negation." },
        { answer: "-ke", reason: "Locative case suffix." }
      ],
      gradingExplanation: "ma precedes the verb complex in negation."
    },
    {
      type: "translate_to_english",
      prompt: "Translate: saku ma talo-mi-ki",
      allowedVocabulary: ["saku", "ma", "talo", "-mi", "-ki"],
      allowedRuleIds: ruleIds.slice(0, 3),
      expectedAnswers: ["The child does not walk."],
      adversarialAnswers: [
        { answer: "The child walks.", reason: "Ignores negation particle ma." },
        { answer: "The child did not walk.", reason: "Wrong tense." }
      ],
      gradingExplanation: "ma negates the present verb talo-mi-ki."
    }
  ];

  for (const ex of exerciseDefs) {
    const res = await api("POST", `/languages/${langId}/exercises`, ex);
    if (res.status === 201) stats.exercises++;
    else console.warn("      exercise failed:", res.json?.error ?? res.status);
  }

  // Final counts
  const finalLex = await api("GET", `/languages/${langId}/lexicon`);
  const finalCorp = await api("GET", `/languages/${langId}/corpus`);
  const profile = await api("GET", `/languages/${langId}`);

  console.log("\n=== Veridspark build complete ===");
  console.log(`Language ID:   ${langId}`);
  console.log(`Lexemes:       ${finalLex.json?.length ?? 0}`);
  console.log(`Corpus:        ${finalCorp.json?.length ?? 0}`);
  console.log(`Grammar notes: ${stats.notes}`);
  console.log(`Exercises:     ${stats.exercises}`);
  console.log(`\nOpen the app, select "${LANGUAGE.name}" in the language picker.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
