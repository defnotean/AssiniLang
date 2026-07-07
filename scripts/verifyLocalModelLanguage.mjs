import { readFile } from "node:fs/promises";

const API = process.env.ASSINI_API_URL ?? "http://127.0.0.1:4321";
const DEV_TOKEN = process.env.ASSINI_DEV_AUTH_TOKEN ?? "dev-local";
const LANGUAGE_NAME = process.env.ASSINI_VERIFY_LANGUAGE ?? "Veridspark";
const PREFERRED_MODEL = process.env.ASSINI_VERIFY_MODEL ?? "Irene";
const PREFERRED_MODEL_BASE_URL = process.env.ASSINI_VERIFY_MODEL_BASE_URL;
const VERIFY_MAX_TOKENS = Number.parseInt(process.env.ASSINI_VERIFY_MAX_TOKENS ?? "8192", 10);
const SOURCE_TITLE = "Veridspark local model verification pack";
const ADVANCED_SOURCE_TITLE = "Veridspark interaction and aspect expansion pack";
const DISCOURSE_SOURCE_TITLE = "Veridspark discourse and habitual expansion pack";
const DISCOURSE_GROUNDING_SOURCE_TITLE = "Veridspark discourse answer lexeme grounding patch";
const COMMAND_SOURCE_TITLE = "Veridspark command and evidential expansion pack";
const COMMAND_GROUNDING_SOURCE_TITLE = "Veridspark reported evidential grounding patch";
const RELATIONAL_SOURCE_TITLE = "Veridspark relational possession and quotation expansion pack v2";
const UPLOADED_NOTEBOOK_SOURCE_TITLE = "Veridspark uploaded field notebook expansion pack v1";
const GOVERNANCE_POLICY_CONTENT =
  "Synthetic Veridspark local model verification policy: generated outputs must cite public notes or corpus and must not expose hidden answer keys.";
const ELDER_WORKFLOW_RATIONALE = "Local verifier elder workflow for reported evidential coverage.";
const ELDER_VERIFIED_CLARIFICATION =
  "Elder-verified clarification: -ne marks reported evidential meaning after the whole finite verb complex.";
const REVIEW_DISPOSITION_REASON =
  "Local verifier escalated this synthetic note to prove review disposition routing.";
const REVIEW_DISPOSITION_RESOLUTION =
  "Local verifier resolved the synthetic escalation after confirming public evidence and elder workflow coverage.";
const REVIEW_DISPOSITION_STATUSES = new Set(["contested", "rejected", "deferred", "escalated"]);

const META = {
  author: "AssiniLang local model verifier",
  year: 2026,
  license: "synthetic-test-data",
  consentRecord: "synthetic-veridspark-local-model-verification-v1"
};

const CONSENT = {
  use: "community-approved",
  restrictions: ["synthetic-test-fixture"]
};

const VERIDSPARK_PHONOLOGY = {
  consonants: ["p", "t", "k", "m", "n", "s", "l", "r", "v", "f"],
  vowels: ["a", "e", "i", "o", "u"],
  syllableTemplate: "(C)V(C)",
  stress: "penultimate",
  notes: [
    "Synthetic test language; not tied to a real community.",
    "f is present in the future suffix -fu."
  ]
};

const results = [];

function auth(userId) {
  return {
    "content-type": "application/json",
    "x-assini-user-id": userId,
    "x-assini-dev-token": DEV_TOKEN
  };
}

function authMultipart(userId) {
  return {
    "x-assini-user-id": userId,
    "x-assini-dev-token": DEV_TOKEN
  };
}

function ok(label, detail = "") {
  results.push({ ok: true, label, detail });
  console.log(`PASS ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, detail = "") {
  results.push({ ok: false, label, detail });
  console.error(`FAIL ${label}${detail ? `: ${detail}` : ""}`);
}

function skip(label, detail = "") {
  results.push({ ok: true, label, detail, skipped: true });
  console.log(`SKIP ${label}${detail ? `: ${detail}` : ""}`);
}

function summaryAndExit() {
  const passed = results.filter((item) => item.ok && !item.skipped).length;
  const skipped = results.filter((item) => item.skipped).length;
  const failed = results.filter((item) => !item.ok).length;
  console.log(`\n=== ${passed} passed, ${skipped} skipped, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

async function api(method, path, body, userId = "reviewer-1") {
  const init = {
    method,
    headers: auth(userId)
  };
  if (body !== undefined) init.body = JSON.stringify(body);

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

async function apiForm(method, path, form, userId = "reviewer-1") {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: authMultipart(userId),
    body: form
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, json, text };
}

async function directJson(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "cache-control": "no-cache" },
      signal: controller.signal
    });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function readDotEnv() {
  try {
    const text = await readFile(".env", "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
  } catch {
    return {};
  }
}

function seg(parts) {
  return parts.map(([surface, lemma, gloss, features]) => ({
    surface,
    lemma,
    gloss,
    features: Array.isArray(features) ? features : [features]
  }));
}

function passage(textTarget, textTranslation, tags, parts) {
  return {
    source: "veridspark-local-model-verification",
    sourceMetadata: META,
    textTarget,
    textTranslation,
    topicTags: tags,
    morphologicalSegmentation: seg(parts),
    consentStatus: CONSENT
  };
}

const EXPANSION_PASSAGES = [
  passage("tara saku nemi-mi-ki", "Father teaches the child.", ["family", "teaching", "present"], [
    ["tara", "tara", "father", "noun"],
    ["saku", "saku", "child", "noun"],
    ["nemi", "nemi", "teach", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("saku liru lira-fu-ki", "The child will sing the song.", ["music", "future"], [
    ["saku", "saku", "child", "noun"],
    ["liru", "liru", "song", "noun"],
    ["lira", "lira", "sing", "verb-root"],
    ["-fu", "-fu", "future", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("niru mira-ke naru-mi-ki", "The friend comes to the river.", ["motion", "locative", "friendship"], [
    ["niru", "niru", "friend", "noun"],
    ["mira", "mira", "river", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["naru", "naru", "come", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("mara toru kira-mi-ta", "You give drinking water to mother.", ["kinship", "giving", "second-person"], [
    ["mara", "mara", "mother", "noun"],
    ["toru", "toru", "drinking water", "noun"],
    ["kira", "kira", "give", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ta", "-ta", "2sg", "person"]
  ]),
  passage("kuma-ke savu-mi-mu", "We learn during the day.", ["time", "learning", "locative"], [
    ["kuma", "kuma", "day", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["savu", "savu", "learn", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-mu", "-mu", "1pl", "person"]
  ]),
  passage("vaku sora-lo-na", "I saw the fire.", ["perception", "past", "first-person"], [
    ["vaku", "vaku", "fire", "noun"],
    ["sora", "sora", "see", "verb-root"],
    ["-lo", "-lo", "past", "tense"],
    ["-na", "-na", "1sg", "person"]
  ]),
  passage("raki-ko tiru", "Eating is good.", ["nominalization", "evaluation"], [
    ["raki", "raki", "eat", "verb-root"],
    ["-ko", "-ko", "nominalizer", "derivation"],
    ["tiru", "tiru", "good", "adjective"]
  ]),
  passage("saku ma silu-mi-ki", "The child does not sleep.", ["negation", "rest"], [
    ["saku", "saku", "child", "noun"],
    ["ma", "ma", "negation", "particle"],
    ["silu", "silu", "sleep", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("vima-ke talo-fu-mu", "We will walk at the mountain.", ["motion", "future", "locative"], [
    ["vima", "vima", "mountain", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["talo", "talo", "walk", "verb-root"],
    ["-fu", "-fu", "future", "tense"],
    ["-mu", "-mu", "1pl", "person"]
  ]),
  passage("piru sora-mi-ta", "You see the sky.", ["perception", "second-person"], [
    ["piru", "piru", "sky", "noun"],
    ["sora", "sora", "see", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ta", "-ta", "2sg", "person"]
  ]),
  passage("suri-ke toru raki-lo-ki", "At the river-bank, he drank water.", ["water", "past", "locative"], [
    ["suri", "suri", "river-bank", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["toru", "toru", "drinking water", "noun"],
    ["raki", "raki", "eat", "verb-root"],
    ["-lo", "-lo", "past", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("laka-ke kora-mi-na", "I speak at the tree.", ["speech", "locative", "first-person"], [
    ["laka", "laka", "tree", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["kora", "kora", "speak", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-na", "-na", "1sg", "person"]
  ])
];

const MODEL_SOURCE_TEXT = `
Veridspark local model verification pack

New lexical probes:
nala = rain
senu = bird
ravi = bright
kemu = basket
vori = guard or protect
pali = cook
tima = gather
moku = listen
nisa = question
kavo = count
lavo = trade
-ri = respectful honorific suffix
vi = yes-no question particle

Grammar probes:
Veridspark keeps tense before person in finite verbs: talo-mi-na means I walk.
The locative suffix -ke attaches to a noun before the verb phrase: mira-ke talo-mi-na.
Negation uses the particle ma immediately before the verb complex: saku ma silu-mi-ki.
Nominalization uses -ko after a verb stem: raki-ko means eating or the act of eating.
The question particle vi appears at the end of a yes-no question: saku talo-mi-ki vi.
`.trim();

const ADVANCED_MODEL_SOURCE_TEXT = `
Veridspark interaction and aspect expansion pack

New lexical probes:
-pa = plural suffix for nouns
-ve = comitative suffix meaning with
-se = progressive aspect suffix on finite verbs
nalo = garden
rinu = path
sela = shell
mavi = cloth
tave = carry
leno = remember
sepa = wait
pavo = open
neru = close
telu = story

Grammar probes:
The plural suffix -pa attaches after a noun stem and before case suffixes: saku-pa-ke means at the children.
The comitative suffix -ve attaches to a noun phrase to mean with: niru-ve means with the friend.
The progressive suffix -se follows tense and precedes person on finite verbs: lira-mi-se-ki means is singing.
Honorific -ri attaches to respected nouns before case or comitative suffixes: tara-ri-ve means with honored father.
Yes-no questions keep normal word order and add vi at the end: pavo-mi-ta vi means do you open it.
`.trim();

const DISCOURSE_MODEL_SOURCE_TEXT = `
Veridspark discourse and habitual expansion pack

New lexical probes:
-nu = habitual aspect suffix on finite verbs
-la = conditional suffix attached to a finished clause
veka = because or causal linker
namo = market
fira = fish
penu = net
milu = salt
ravo = return
keso = ask
poku = answer
nema = know
lenu = morning
vane = evening

Grammar probes:
The habitual suffix -nu follows tense and precedes person: lira-mi-nu-ki means usually sings.
The conditional suffix -la attaches after the finite verb complex: talo-mi-ki-la means if he walks.
The causal linker veka introduces a reason phrase or clause: nala-ke veka sepa-mi-mu means we wait because of rain.
Comitative -ve can mark tools as well as companions: penu-ve means with a net.
Questions can combine with progressive or habitual aspect while keeping vi at the end.
`.trim();

const DISCOURSE_GROUNDING_SOURCE_TEXT = `
Veridspark discourse answer lexeme grounding patch

New lexical probe:
poku = answer; verb root used for replying to a question

Example:
poku-mi-na means I answer.

Grammar probe:
The verb root poku takes the normal tense-person suffix chain: poku-mi-na is answer-PRES-1SG.
`.trim();

const COMMAND_MODEL_SOURCE_TEXT = `
Veridspark command and evidential expansion pack

New lexical probes:
-ro = imperative mood suffix on bare verb roots
-ne = reported evidential suffix on finite verb complexes
meka = door
falu = drum
ruma = home or house
veno = message
lome = hand
siva = send

Grammar probes:
Imperative -ro attaches to a bare verb root without tense or person suffixes: pavo-ro means open it.
Reported evidential -ne attaches after the finite verb complex: ravo-mi-ki-ne means they say she returns.
Tool phrases continue to use comitative -ve: lome-ve means by hand or with the hand.
Commands keep objects before the imperative verb: meka pavo-ro means open the door.
`.trim();

const COMMAND_GROUNDING_SOURCE_TEXT = `
Veridspark reported evidential grounding patch

New lexical probe:
-ne = reported evidential suffix meaning reportedly or they say

Examples:
ravo-mi-ki-ne means they say she returns.
kora-mi-ki-ne means they say she speaks.

Grammar probe:
The reported evidential suffix -ne attaches after the whole finite verb complex: ravo-mi-ki-ne is return-PRES-3SG-REP.
`.trim();

const RELATIONAL_MODEL_SOURCE_TEXT = `
Veridspark relational possession and quotation expansion pack

New lexical probes:
-sa = possessed noun suffix showing the noun belongs to the nearest possessor
eka = comparative linker meaning than or compared with
vo = quotative particle after quoted speech or quoted content
lumi = lamp
rano = canoe
pesa = bowl
varu = strong

Grammar probes:
Possession places the possessor before the possessed noun and adds -sa to the possessed noun: tara kemu-sa means father's basket or his basket.
Comparatives place the quality before eka and the comparison standard after eka: lumi ravi eka vaku means the lamp is brighter than the fire.
Quotative vo follows the quoted command or clause before the speaking or knowing verb: meka pavo-ro vo tara kora-mi-ki means father says, "Open the door."
The possessed suffix -sa attaches before case suffixes when both are present, so ruma-sa-ke means at the possessed home.
`.trim();

const UPLOADED_NOTEBOOK_SOURCE_TEXT = `
Veridspark uploaded field notebook expansion pack

New lexical probes:
ano = and linker joining nouns or clauses
pira = but or contrast linker
-li = sequential clause suffix meaning then or after that
ratu = road
kulu = small
mipa = group

Grammar probes:
The linker ano joins two nouns before the verb: tara ano mara kora-mi-ki means father and mother speak.
The contrast linker pira joins two clauses with a contrast: nala pira lumi ravi means it rains, but the lamp is bright.
The sequential suffix -li attaches after a complete finite verb complex: ravo-mi-ki-li means after she returns or then she returns.
Sequential -li can be followed by a second clause: niru ravo-mi-ki-li saku lira-mi-ki means after the friend returns, the child sings.
`.trim();

const ADVANCED_PASSAGES = [
  passage("nalo-ke saku-pa sepa-mi-se-ki", "The children are waiting in the garden.", ["garden", "plural", "progressive"], [
    ["nalo", "nalo", "garden", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["saku", "saku", "child", "noun"],
    ["-pa", "-pa", "plural", "number"],
    ["sepa", "sepa", "wait", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-se", "-se", "progressive", "aspect"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("mavi tave-fu-na", "I will carry the cloth.", ["carrying", "future", "first-person"], [
    ["mavi", "mavi", "cloth", "noun"],
    ["tave", "tave", "carry", "verb-root"],
    ["-fu", "-fu", "future", "tense"],
    ["-na", "-na", "1sg", "person"]
  ]),
  passage("telu leno-mi-mu", "We remember the story.", ["memory", "first-person-plural"], [
    ["telu", "telu", "story", "noun"],
    ["leno", "leno", "remember", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-mu", "-mu", "1pl", "person"]
  ]),
  passage("rinu-ke niru tave-lo-ki", "The friend carried along the path.", ["path", "past", "friendship"], [
    ["rinu", "rinu", "path", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["niru", "niru", "friend", "noun"],
    ["tave", "tave", "carry", "verb-root"],
    ["-lo", "-lo", "past", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("pavo-mi-ta vi", "Do you open it?", ["question", "second-person"], [
    ["pavo", "pavo", "open", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ta", "-ta", "2sg", "person"],
    ["vi", "vi", "yes-no question", "particle"]
  ]),
  passage("ma neru-mi-na", "I do not close it.", ["negation", "first-person"], [
    ["ma", "ma", "negation", "particle"],
    ["neru", "neru", "close", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-na", "-na", "1sg", "person"]
  ]),
  passage("sela-pa lavo-mi-mu", "We trade shells.", ["trade", "plural"], [
    ["sela", "sela", "shell", "noun"],
    ["-pa", "-pa", "plural", "number"],
    ["lavo", "lavo", "trade", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-mu", "-mu", "1pl", "person"]
  ]),
  passage("tara-ri niru-ve kora-mi-se-ki", "Honored father is speaking with the friend.", ["honorific", "comitative", "progressive"], [
    ["tara", "tara", "father", "noun"],
    ["-ri", "-ri", "honorific", "derivation"],
    ["niru", "niru", "friend", "noun"],
    ["-ve", "-ve", "comitative", "case"],
    ["kora", "kora", "speak", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-se", "-se", "progressive", "aspect"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("nala-ke senu lira-mi-ki vi", "Does the bird sing in the rain?", ["rain", "question", "music"], [
    ["nala", "nala", "rain", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["senu", "senu", "bird", "noun"],
    ["lira", "lira", "sing", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"],
    ["vi", "vi", "yes-no question", "particle"]
  ]),
  passage("vori-ko tiru", "Protecting is good.", ["nominalization", "protection"], [
    ["vori", "vori", "protect", "verb-root"],
    ["-ko", "-ko", "nominalizer", "derivation"],
    ["tiru", "tiru", "good", "adjective"]
  ]),
  passage("kemu-pa mira-ke tima-mi-mu", "We gather baskets at the river.", ["basket", "plural", "locative"], [
    ["kemu", "kemu", "basket", "noun"],
    ["-pa", "-pa", "plural", "number"],
    ["mira", "mira", "river", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["tima", "tima", "gather", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-mu", "-mu", "1pl", "person"]
  ]),
  passage("moku-mi-se-ta vi", "Are you listening?", ["listening", "progressive", "question"], [
    ["moku", "moku", "listen", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-se", "-se", "progressive", "aspect"],
    ["-ta", "-ta", "2sg", "person"],
    ["vi", "vi", "yes-no question", "particle"]
  ])
];

const DISCOURSE_PASSAGES = [
  passage("lenu-ke fira penu-ve tima-mi-nu-mu", "In the morning, we usually gather fish with a net.", ["habitual", "tool", "morning"], [
    ["lenu", "lenu", "morning", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["fira", "fira", "fish", "noun"],
    ["penu", "penu", "net", "noun"],
    ["-ve", "-ve", "comitative", "case"],
    ["tima", "tima", "gather", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-nu", "-nu", "habitual", "aspect"],
    ["-mu", "-mu", "1pl", "person"]
  ]),
  passage("namo-ke milu lavo-mi-mu", "We trade salt at the market.", ["market", "trade", "locative"], [
    ["namo", "namo", "market", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["milu", "milu", "salt", "noun"],
    ["lavo", "lavo", "trade", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-mu", "-mu", "1pl", "person"]
  ]),
  passage("niru talo-mi-ki-la niru ravo-fu-ki", "If the friend walks, the friend will return.", ["conditional", "motion", "future"], [
    ["niru", "niru", "friend", "noun"],
    ["talo", "talo", "walk", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"],
    ["-la", "-la", "conditional", "clause-suffix"],
    ["niru", "niru", "friend", "noun"],
    ["ravo", "ravo", "return", "verb-root"],
    ["-fu", "-fu", "future", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("saku keso-mi-ta vi", "Do you ask the child?", ["question", "speech", "second-person"], [
    ["saku", "saku", "child", "noun"],
    ["keso", "keso", "ask", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ta", "-ta", "2sg", "person"],
    ["vi", "vi", "yes-no question", "particle"]
  ]),
  passage("poku-mi-na", "I answer.", ["speech", "first-person"], [
    ["poku", "poku", "answer", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-na", "-na", "1sg", "person"]
  ]),
  passage("nala-ke veka sepa-mi-mu", "We wait because of rain.", ["causal", "rain"], [
    ["nala", "nala", "rain", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["veka", "veka", "because", "causal-linker"],
    ["sepa", "sepa", "wait", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-mu", "-mu", "1pl", "person"]
  ]),
  passage("mara nema-mi-ki", "Mother knows.", ["knowledge", "kinship"], [
    ["mara", "mara", "mother", "noun"],
    ["nema", "nema", "know", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("vane-ke lira-mi-nu-ki", "In the evening, she usually sings.", ["habitual", "evening", "music"], [
    ["vane", "vane", "evening", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["lira", "lira", "sing", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-nu", "-nu", "habitual", "aspect"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("keso-ko tiru", "Asking is good.", ["nominalization", "speech"], [
    ["keso", "keso", "ask", "verb-root"],
    ["-ko", "-ko", "nominalizer", "derivation"],
    ["tiru", "tiru", "good", "adjective"]
  ]),
  passage("fira raki-lo-mu", "We ate fish.", ["food", "past"], [
    ["fira", "fira", "fish", "noun"],
    ["raki", "raki", "eat", "verb-root"],
    ["-lo", "-lo", "past", "tense"],
    ["-mu", "-mu", "1pl", "person"]
  ])
];

const COMMAND_PASSAGES = [
  passage("meka pavo-ro", "Open the door.", ["command", "door"], [
    ["meka", "meka", "door", "noun"],
    ["pavo", "pavo", "open", "verb-root"],
    ["-ro", "-ro", "imperative", "mood"]
  ]),
  passage("falu moku-ro", "Listen to the drum.", ["command", "music"], [
    ["falu", "falu", "drum", "noun"],
    ["moku", "moku", "listen", "verb-root"],
    ["-ro", "-ro", "imperative", "mood"]
  ]),
  passage("ruma-ke ravo-mi-ki-ne", "They say she returns home.", ["reported", "home", "evidential"], [
    ["ruma", "ruma", "home", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["ravo", "ravo", "return", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"],
    ["-ne", "-ne", "reported-evidential", "evidential"]
  ]),
  passage("veno kora-mi-ki-ne", "They say she speaks the message.", ["reported", "speech", "message"], [
    ["veno", "veno", "message", "noun"],
    ["kora", "kora", "speak", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"],
    ["-ne", "-ne", "reported-evidential", "evidential"]
  ]),
  passage("lome-ve meka pavo-mi-ta", "You open the door by hand.", ["tool", "door", "second-person"], [
    ["lome", "lome", "hand", "noun"],
    ["-ve", "-ve", "comitative", "case"],
    ["meka", "meka", "door", "noun"],
    ["pavo", "pavo", "open", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ta", "-ta", "2sg", "person"]
  ]),
  passage("veno siva-ro", "Send the message.", ["command", "message"], [
    ["veno", "veno", "message", "noun"],
    ["siva", "siva", "send", "verb-root"],
    ["-ro", "-ro", "imperative", "mood"]
  ])
];

const RELATIONAL_PASSAGES = [
  passage("tara kemu-sa vori-mi-ki", "Father protects his basket.", ["possession", "family", "protection"], [
    ["tara", "tara", "father", "noun"],
    ["kemu", "kemu", "basket", "noun"],
    ["-sa", "-sa", "possessed", "possession"],
    ["vori", "vori", "protect", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("niru liru-sa lira-mi-ki", "The friend sings their song.", ["possession", "music", "friendship"], [
    ["niru", "niru", "friend", "noun"],
    ["liru", "liru", "song", "noun"],
    ["-sa", "-sa", "possessed", "possession"],
    ["lira", "lira", "sing", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("lumi ravi eka vaku", "The lamp is brighter than the fire.", ["comparison", "brightness"], [
    ["lumi", "lumi", "lamp", "noun"],
    ["ravi", "ravi", "bright", "adjective"],
    ["eka", "eka", "comparative-linker", "particle"],
    ["vaku", "vaku", "fire", "noun"]
  ]),
  passage("rano varu eka penu", "The canoe is stronger than the net.", ["comparison", "tools"], [
    ["rano", "rano", "canoe", "noun"],
    ["varu", "varu", "strong", "adjective"],
    ["eka", "eka", "comparative-linker", "particle"],
    ["penu", "penu", "net", "noun"]
  ]),
  passage("meka pavo-ro vo tara kora-mi-ki", "Father says, \"Open the door.\"", ["quotation", "command", "speech"], [
    ["meka", "meka", "door", "noun"],
    ["pavo", "pavo", "open", "verb-root"],
    ["-ro", "-ro", "imperative", "mood"],
    ["vo", "vo", "quotative", "particle"],
    ["tara", "tara", "father", "noun"],
    ["kora", "kora", "speak", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("pesa tima-mi-na vo mara moku-mi-ki", "Mother hears me say that I gather bowls.", ["quotation", "gathering", "kinship"], [
    ["pesa", "pesa", "bowl", "noun"],
    ["tima", "tima", "gather", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-na", "-na", "1sg", "person"],
    ["vo", "vo", "quotative", "particle"],
    ["mara", "mara", "mother", "noun"],
    ["moku", "moku", "listen", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("saku lome-sa sora-mi-ki", "The child sees their hand.", ["possession", "perception"], [
    ["saku", "saku", "child", "noun"],
    ["lome", "lome", "hand", "noun"],
    ["-sa", "-sa", "possessed", "possession"],
    ["sora", "sora", "see", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("veno siva-mi-na vo niru nema-mi-ki", "The friend knows that I send the message.", ["quotation", "message", "knowledge"], [
    ["veno", "veno", "message", "noun"],
    ["siva", "siva", "send", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-na", "-na", "1sg", "person"],
    ["vo", "vo", "quotative", "particle"],
    ["niru", "niru", "friend", "noun"],
    ["nema", "nema", "know", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ])
];

const UPLOADED_NOTEBOOK_PASSAGES = [
  passage("tara ano mara kora-mi-ki", "Father and mother speak.", ["coordination", "family", "speech"], [
    ["tara", "tara", "father", "noun"],
    ["ano", "ano", "and", "linker"],
    ["mara", "mara", "mother", "noun"],
    ["kora", "kora", "speak", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("nala pira lumi ravi", "It rains, but the lamp is bright.", ["contrast", "weather", "brightness"], [
    ["nala", "nala", "rain", "noun"],
    ["pira", "pira", "but", "linker"],
    ["lumi", "lumi", "lamp", "noun"],
    ["ravi", "ravi", "bright", "adjective"]
  ]),
  passage("niru ravo-mi-ki-li saku lira-mi-ki", "After the friend returns, the child sings.", ["sequence", "return", "music"], [
    ["niru", "niru", "friend", "noun"],
    ["ravo", "ravo", "return", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"],
    ["-li", "-li", "sequential", "clause-suffix"],
    ["saku", "saku", "child", "noun"],
    ["lira", "lira", "sing", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("niru ravo-mi-ki-li liru lira-mi-ki", "After the friend returns, she sings the song.", ["sequence", "return", "music"], [
    ["niru", "niru", "friend", "noun"],
    ["ravo", "ravo", "return", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"],
    ["-li", "-li", "sequential", "clause-suffix"],
    ["liru", "liru", "song", "noun"],
    ["lira", "lira", "sing", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-ki", "-ki", "3sg", "person"]
  ]),
  passage("ratu-ke mipa kulu talo-mi-nu-ki", "The small group usually walks on the road.", ["road", "habitual", "group"], [
    ["ratu", "ratu", "road", "noun"],
    ["-ke", "-ke", "locative", "case"],
    ["mipa", "mipa", "group", "noun"],
    ["kulu", "kulu", "small", "adjective"],
    ["talo", "talo", "walk", "verb-root"],
    ["-mi", "-mi", "present", "tense"],
    ["-nu", "-nu", "habitual", "aspect"],
    ["-ki", "-ki", "3sg", "person"]
  ])
];

function buildExerciseDefs(ruleIds) {
  const firstRule = ruleIds[0];
  const twoRules = ruleIds.slice(0, Math.max(1, Math.min(2, ruleIds.length)));
  const threeRules = ruleIds.slice(0, Math.max(1, Math.min(3, ruleIds.length)));
  return [
    {
      type: "translate_to_target",
      prompt: "Translate into Veridspark: The child does not sleep.",
      allowedVocabulary: ["saku", "ma", "silu", "-mi", "-ki"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["saku ma silu-mi-ki"],
      adversarialAnswers: [
        { answer: "saku silu-mi-ki", reason: "This omits the negation particle ma." },
        { answer: "saku ma silu-lo-ki", reason: "This uses past tense instead of present tense." }
      ],
      gradingExplanation: "The subject is saku, negation is ma before the verb, and silu-mi-ki is sleep-PRES-3SG."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: saku liru lira-fu-ki",
      allowedVocabulary: ["saku", "liru", "lira", "-fu", "-ki"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["The child will sing the song."],
      adversarialAnswers: [
        { answer: "The child sings the song.", reason: "-fu marks future, not present." },
        { answer: "I will sing the song.", reason: "-ki marks third person singular, not first person." }
      ],
      gradingExplanation: "SOV order places child and song before the verb; lira-fu-ki is sing-FUT-3SG."
    },
    {
      type: "choose_particle",
      prompt: "Which suffix marks the locative in vima-ke?",
      allowedVocabulary: ["-ke", "-ko", "-ki", "-fu"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["-ke"],
      adversarialAnswers: [
        { answer: "-ko", reason: "-ko nominalizes verbs; it does not mark location." },
        { answer: "-fu", reason: "-fu marks future tense on verbs." }
      ],
      gradingExplanation: "-ke is the locative suffix attached to nouns such as vima-ke and mira-ke."
    },
    {
      type: "segment",
      prompt: "Segment the Veridspark word raki-ko.",
      allowedVocabulary: ["raki", "-ko"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["raki-ko"],
      adversarialAnswers: [
        { answer: "raki", reason: "This omits the nominalizer suffix." },
        { answer: "raki-ke", reason: "-ke is locative, not nominalizing." }
      ],
      gradingExplanation: "raki is the verb root eat and -ko turns the verb into a noun-like form."
    },
    {
      type: "translate_to_target",
      prompt: "Translate into Veridspark: You see the sky.",
      allowedVocabulary: ["piru", "sora", "-mi", "-ta"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["piru sora-mi-ta"],
      adversarialAnswers: [
        { answer: "piru sora-mi-na", reason: "-na is first person singular, not second person." },
        { answer: "piru sora-lo-ta", reason: "-lo marks past tense, but the prompt is present." }
      ],
      gradingExplanation: "The object piru precedes the verb complex sora-mi-ta, see-PRES-2SG."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: vima-ke talo-fu-mu",
      allowedVocabulary: ["vima", "-ke", "talo", "-fu", "-mu"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["We will walk at the mountain."],
      adversarialAnswers: [
        { answer: "We walked at the mountain.", reason: "-fu marks future, not past." },
        { answer: "I will walk at the mountain.", reason: "-mu marks first person plural, not singular." }
      ],
      gradingExplanation: "vima-ke is mountain-LOC and talo-fu-mu is walk-FUT-1PL."
    }
  ];
}

function buildAdvancedExerciseDefs(ruleIds) {
  const firstRule = ruleIds[0];
  const twoRules = ruleIds.slice(0, Math.max(1, Math.min(2, ruleIds.length)));
  const threeRules = ruleIds.slice(0, Math.max(1, Math.min(3, ruleIds.length)));
  return [
    {
      type: "translate_to_target",
      prompt: "Translate into Veridspark: The children are waiting in the garden.",
      allowedVocabulary: ["nalo", "-ke", "saku", "-pa", "sepa", "-mi", "-se", "-ki"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["nalo-ke saku-pa sepa-mi-se-ki"],
      adversarialAnswers: [
        { answer: "nalo-ke saku sepa-mi-se-ki", reason: "This omits the plural suffix -pa on children." },
        { answer: "nalo-ke saku-pa sepa-mi-ki", reason: "This omits the progressive suffix -se." }
      ],
      gradingExplanation: "The garden is marked with -ke, saku takes plural -pa, and sepa-mi-se-ki marks wait-PRES-PROG-3SG."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: tara-ri niru-ve kora-mi-se-ki",
      allowedVocabulary: ["tara", "-ri", "niru", "-ve", "kora", "-mi", "-se", "-ki"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["Honored father is speaking with the friend."],
      adversarialAnswers: [
        { answer: "Father spoke with the friend.", reason: "-mi marks present and -se marks progressive, not past." },
        { answer: "The friend is speaking with father.", reason: "tara-ri is the respected speaker; niru-ve is the with-phrase." }
      ],
      gradingExplanation: "tara-ri is honored father, niru-ve is with the friend, and kora-mi-se-ki is speaking now."
    },
    {
      type: "choose_particle",
      prompt: "Which suffix marks progressive aspect in moku-mi-se-ta?",
      allowedVocabulary: ["-se", "-mi", "-ta", "-pa"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["-se"],
      adversarialAnswers: [
        { answer: "-mi", reason: "-mi marks present tense." },
        { answer: "-pa", reason: "-pa marks plural nouns." }
      ],
      gradingExplanation: "-se follows the tense suffix and marks progressive aspect in finite verbs."
    },
    {
      type: "segment",
      prompt: "Segment the Veridspark word saku-pa.",
      allowedVocabulary: ["saku", "-pa"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["saku-pa"],
      adversarialAnswers: [
        { answer: "saku", reason: "This omits the plural suffix." },
        { answer: "saku-ke", reason: "-ke is locative, not plural." }
      ],
      gradingExplanation: "saku is child and -pa is the plural suffix for nouns."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: pavo-mi-ta vi",
      allowedVocabulary: ["pavo", "-mi", "-ta", "vi"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["Do you open it?"],
      adversarialAnswers: [
        { answer: "I open it.", reason: "-ta marks second person and vi marks a question." },
        { answer: "You opened it.", reason: "-mi marks present, not past." }
      ],
      gradingExplanation: "pavo-mi-ta is open-PRES-2SG and final vi turns the clause into a yes-no question."
    },
    {
      type: "translate_to_target",
      prompt: "Translate into Veridspark: We remember the story.",
      allowedVocabulary: ["telu", "leno", "-mi", "-mu"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["telu leno-mi-mu"],
      adversarialAnswers: [
        { answer: "telu leno-mi-na", reason: "-na is first person singular, not first person plural." },
        { answer: "telu leno-lo-mu", reason: "-lo marks past, but the prompt is present." }
      ],
      gradingExplanation: "The object telu precedes the verb complex leno-mi-mu, remember-PRES-1PL."
    }
  ];
}

function buildDiscourseExerciseDefs(ruleIds) {
  const firstRule = ruleIds[0];
  const twoRules = ruleIds.slice(0, Math.max(1, Math.min(2, ruleIds.length)));
  const threeRules = ruleIds.slice(0, Math.max(1, Math.min(3, ruleIds.length)));
  return [
    {
      type: "translate_to_target",
      prompt: "Translate into Veridspark: In the morning, we usually gather fish with a net.",
      allowedVocabulary: ["lenu", "-ke", "fira", "penu", "-ve", "tima", "-mi", "-nu", "-mu"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["lenu-ke fira penu-ve tima-mi-nu-mu"],
      adversarialAnswers: [
        { answer: "lenu-ke fira penu-ve tima-mi-mu", reason: "This omits the habitual suffix -nu." },
        { answer: "lenu-ke fira penu-ke tima-mi-nu-mu", reason: "-ke marks location; the tool phrase needs comitative -ve." }
      ],
      gradingExplanation: "lenu-ke marks morning, penu-ve is with a net, and tima-mi-nu-mu marks gather-PRES-HAB-1PL."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: niru talo-mi-ki-la niru ravo-fu-ki",
      allowedVocabulary: ["niru", "talo", "-mi", "-ki", "-la", "ravo", "-fu"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["If the friend walks, the friend will return."],
      adversarialAnswers: [
        { answer: "The friend walked and returned.", reason: "-la marks a conditional clause and -fu marks future return." },
        { answer: "If I walk, the friend will return.", reason: "-ki marks third-person singular, not first person." }
      ],
      gradingExplanation: "The first clause ends in -la for conditional meaning, and ravo-fu-ki marks will return."
    },
    {
      type: "choose_particle",
      prompt: "Which suffix marks habitual aspect in lira-mi-nu-ki?",
      allowedVocabulary: ["-nu", "-se", "-mi", "-ki"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["-nu"],
      adversarialAnswers: [
        { answer: "-se", reason: "-se marks progressive aspect, not habitual aspect." },
        { answer: "-mi", reason: "-mi marks present tense." }
      ],
      gradingExplanation: "-nu follows tense and precedes person to mark habitual aspect."
    },
    {
      type: "segment",
      prompt: "Segment the Veridspark word talo-mi-ki-la.",
      allowedVocabulary: ["talo", "-mi", "-ki", "-la"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["talo-mi-ki-la"],
      adversarialAnswers: [
        { answer: "talo-mi-ki", reason: "This omits the conditional suffix -la." },
        { answer: "talo-mi-la-ki", reason: "-la attaches after the finite verb complex." }
      ],
      gradingExplanation: "talo is walk, -mi is present, -ki is third singular, and -la marks the completed clause as conditional."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: nala-ke veka sepa-mi-mu",
      allowedVocabulary: ["nala", "-ke", "veka", "sepa", "-mi", "-mu"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["We wait because of rain."],
      adversarialAnswers: [
        { answer: "We wait at the river.", reason: "nala means rain, and veka marks a cause." },
        { answer: "I wait because of rain.", reason: "-mu marks first person plural, not singular." }
      ],
      gradingExplanation: "nala-ke is the rain phrase, veka is the causal linker, and sepa-mi-mu is wait-PRES-1PL."
    }
  ];
}

function buildCommandExerciseDefs(ruleIds) {
  const firstRule = ruleIds[0];
  const twoRules = ruleIds.slice(0, Math.max(1, Math.min(2, ruleIds.length)));
  const threeRules = ruleIds.slice(0, Math.max(1, Math.min(3, ruleIds.length)));
  return [
    {
      type: "translate_to_target",
      prompt: "Translate into Veridspark: Open the door.",
      allowedVocabulary: ["meka", "pavo", "-ro"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["meka pavo-ro"],
      adversarialAnswers: [
        { answer: "meka pavo-mi-ta", reason: "This is a second-person statement, not an imperative command." },
        { answer: "pavo-ro meka", reason: "Objects precede imperative verbs in Veridspark commands." }
      ],
      gradingExplanation: "meka is door and pavo-ro marks open-IMP with the imperative suffix -ro."
    },
    {
      type: "choose_particle",
      prompt: "Which suffix marks imperative mood in pavo-ro?",
      allowedVocabulary: ["-ro", "-mi", "-ta", "-ne"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["-ro"],
      adversarialAnswers: [
        { answer: "-mi", reason: "-mi marks present tense." },
        { answer: "-ne", reason: "-ne marks reported evidential meaning." }
      ],
      gradingExplanation: "-ro attaches to a bare verb root to form an imperative command."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: ruma-ke ravo-mi-ki-ne",
      allowedVocabulary: ["ruma", "-ke", "ravo", "-mi", "-ki", "-ne"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["They say she returns home."],
      adversarialAnswers: [
        { answer: "She returned home.", reason: "-mi is present and -ne marks reported evidence, not past." },
        { answer: "Return home!", reason: "This is a finite reported clause, not an imperative command." }
      ],
      gradingExplanation: "ruma-ke is home-LOC, ravo-mi-ki is returns, and -ne adds reported evidential meaning."
    },
    {
      type: "choose_particle",
      prompt: "Which suffix marks reported evidential meaning in ravo-mi-ki-ne?",
      allowedVocabulary: ["-ne", "-ki", "-mi", "-ro"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["-ne"],
      adversarialAnswers: [
        { answer: "-ki", reason: "-ki marks third-person singular." },
        { answer: "-ro", reason: "-ro marks imperative mood." }
      ],
      gradingExplanation: "-ne attaches after the finite verb complex to mark reported evidential meaning."
    },
    {
      type: "segment",
      prompt: "Segment the Veridspark word ravo-mi-ki-ne.",
      allowedVocabulary: ["ravo", "-mi", "-ki", "-ne"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["ravo-mi-ki-ne"],
      adversarialAnswers: [
        { answer: "ravo-mi-ki", reason: "This omits the reported evidential suffix." },
        { answer: "ravo-ne-mi-ki", reason: "-ne attaches after the finite verb complex." }
      ],
      gradingExplanation: "ravo is return, -mi is present, -ki is third singular, and -ne marks reported evidential."
    }
  ];
}

function buildRelationalExerciseDefs(ruleIds) {
  const firstRule = ruleIds[0];
  const twoRules = ruleIds.slice(0, Math.max(1, Math.min(2, ruleIds.length)));
  const threeRules = ruleIds.slice(0, Math.max(1, Math.min(3, ruleIds.length)));
  return [
    {
      type: "translate_to_english",
      prompt: "Translate into English: tara kemu-sa vori-mi-ki",
      allowedVocabulary: ["tara", "kemu", "-sa", "vori", "-mi", "-ki"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["Father protects his basket."],
      adversarialAnswers: [
        { answer: "Father protects the child.", reason: "kemu means basket, and -sa marks it as possessed." },
        { answer: "I protect father's basket.", reason: "-ki marks third-person singular, not first person." }
      ],
      gradingExplanation: "tara is the possessor, kemu-sa is the possessed basket, and vori-mi-ki is protect-PRES-3SG."
    },
    {
      type: "choose_particle",
      prompt: "Which suffix marks possession in kemu-sa?",
      allowedVocabulary: ["-sa", "-ke", "-se", "-ne"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["-sa"],
      adversarialAnswers: [
        { answer: "-ke", reason: "-ke marks locative case." },
        { answer: "-ne", reason: "-ne marks reported evidential meaning." }
      ],
      gradingExplanation: "-sa attaches to possessed nouns such as kemu-sa and liru-sa."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: lumi ravi eka vaku",
      allowedVocabulary: ["lumi", "ravi", "eka", "vaku"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["The lamp is brighter than the fire."],
      adversarialAnswers: [
        { answer: "The fire is brighter than the lamp.", reason: "The standard follows eka, so vaku is the comparison standard." },
        { answer: "The lamp is bright fire.", reason: "eka marks a comparison rather than a compound noun." }
      ],
      gradingExplanation: "lumi is lamp, ravi is bright, and eka introduces the comparison standard vaku."
    },
    {
      type: "choose_particle",
      prompt: "Which particle marks comparison in lumi ravi eka vaku?",
      allowedVocabulary: ["eka", "vo", "vi", "veka"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["eka"],
      adversarialAnswers: [
        { answer: "vo", reason: "vo marks quoted speech or quoted content." },
        { answer: "vi", reason: "vi marks yes-no questions." }
      ],
      gradingExplanation: "eka is the comparative linker meaning than or compared with."
    },
    {
      type: "translate_to_target",
      prompt: "Translate into Veridspark: Father says, \"Open the door.\"",
      allowedVocabulary: ["meka", "pavo", "-ro", "vo", "tara", "kora", "-mi", "-ki"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["meka pavo-ro vo tara kora-mi-ki"],
      adversarialAnswers: [
        { answer: "meka pavo-mi-ta vo tara kora-mi-ki", reason: "The quoted command needs imperative -ro." },
        { answer: "tara kora-mi-ki meka pavo-ro", reason: "Quoted content precedes vo and the speaking verb." }
      ],
      gradingExplanation: "The quoted command meka pavo-ro comes before vo, followed by tara kora-mi-ki."
    },
    {
      type: "segment",
      prompt: "Segment the Veridspark word kemu-sa.",
      allowedVocabulary: ["kemu", "-sa"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["kemu-sa"],
      adversarialAnswers: [
        { answer: "kemu", reason: "This omits the possessed suffix." },
        { answer: "kemu-se", reason: "-se marks progressive aspect, not possession." }
      ],
      gradingExplanation: "kemu is basket and -sa marks the noun as possessed."
    }
  ];
}

function buildUploadedNotebookExerciseDefs(ruleIds) {
  const firstRule = ruleIds[0];
  const twoRules = ruleIds.slice(0, Math.max(1, Math.min(2, ruleIds.length)));
  const threeRules = ruleIds.slice(0, Math.max(1, Math.min(3, ruleIds.length)));
  return [
    {
      type: "translate_to_english",
      prompt: "Translate into English: tara ano mara kora-mi-ki",
      allowedVocabulary: ["tara", "ano", "mara", "kora", "-mi", "-ki"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["Father and mother speak."],
      adversarialAnswers: [
        { answer: "Father speaks to mother.", reason: "ano coordinates father and mother; it is not a dative marker." },
        { answer: "Father and mother spoke.", reason: "-mi marks present tense, not past." }
      ],
      gradingExplanation: "ano links the two nouns, and kora-mi-ki marks speak-PRES-3SG."
    },
    {
      type: "choose_particle",
      prompt: "Which linker marks contrast in nala pira lumi ravi?",
      allowedVocabulary: ["pira", "ano", "veka", "vi"],
      allowedRuleIds: [firstRule],
      expectedAnswers: ["pira"],
      adversarialAnswers: [
        { answer: "ano", reason: "ano coordinates without contrast." },
        { answer: "vi", reason: "vi marks yes-no questions." }
      ],
      gradingExplanation: "pira links contrasting clauses or phrases and means but."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: niru ravo-mi-ki-li saku lira-mi-ki",
      allowedVocabulary: ["niru", "ravo", "-mi", "-ki", "-li", "saku", "lira"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["After the friend returns, the child sings."],
      adversarialAnswers: [
        { answer: "The friend sings after the child returns.", reason: "The first clause is niru ravo-mi-ki-li; the second is saku lira-mi-ki." },
        { answer: "The friend returned and the child sang.", reason: "-mi is present and -li marks sequence, not past." }
      ],
      gradingExplanation: "-li follows the completed first verb complex to mark sequence before the next clause."
    },
    {
      type: "segment",
      prompt: "Segment the Veridspark word ravo-mi-ki-li.",
      allowedVocabulary: ["ravo", "-mi", "-ki", "-li"],
      allowedRuleIds: twoRules,
      expectedAnswers: ["ravo-mi-ki-li"],
      adversarialAnswers: [
        { answer: "ravo-mi-ki", reason: "This omits the sequential suffix." },
        { answer: "ravo-li-mi-ki", reason: "-li attaches after the complete finite verb complex." }
      ],
      gradingExplanation: "ravo is return, -mi is present, -ki is third singular, and -li marks sequence."
    }
  ];
}

function ids(items) {
  return items.map((item) => item.id);
}

function sameModel(left, right) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

function visibleAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => part?.type === "text" && typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();
  }
  return "";
}

async function probeDiscoveredModel(candidate) {
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
        detail: typeof reasoning === "string" && reasoning.trim()
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

async function configurePreferredModel() {
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
  const preferred = candidates.find((candidate) => (
    sameModel(candidate.model, PREFERRED_MODEL)
    && (!PREFERRED_MODEL_BASE_URL || candidate.baseUrl === PREFERRED_MODEL_BASE_URL)
  )) ?? candidates.find((candidate) => (
    String(candidate.model ?? "").toLowerCase().includes(PREFERRED_MODEL.toLowerCase())
    && (!PREFERRED_MODEL_BASE_URL || candidate.baseUrl === PREFERRED_MODEL_BASE_URL)
  ));

  const current = candidates.find((candidate) => (
    status.status === 200
    && status.json?.baseUrl === candidate.baseUrl
    && status.json?.model === candidate.model
  ));
  const orderedCandidates = [
    preferred,
    current,
    ...candidates
  ].filter((candidate, index, all) => (
    candidate && all.findIndex((item) => item?.id === candidate.id) === index
  ));

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

  if (
    status.status === 200
    && status.json?.baseUrl === selected.baseUrl
    && status.json?.model === selected.model
  ) {
    skip("Preferred model switch", `${selected.model} already active`);
    return;
  }

  const saved = await api("PUT", "/llm/settings", {
    provider: selected.provider,
    baseUrl: selected.baseUrl,
    model: selected.model,
    timeoutMs: 300_000,
    maxTokens: Number.isInteger(VERIFY_MAX_TOKENS) && VERIFY_MAX_TOKENS > 0 ? VERIFY_MAX_TOKENS : 8192,
    jsonMode: process.env.ASSINI_VERIFY_JSON_MODE === "false" ? false : true
  }, "programmer-1");

  if (saved.status === 200) {
    ok("Preferred model switch", `${selected.model} @ ${selected.baseUrl}`);
  } else {
    fail("Preferred model switch", `${saved.status} ${String(saved.text).slice(0, 300)}`);
  }
}

async function ensureLanguage() {
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
      const patched = await api("PATCH", `/languages/${language.id}`, {
        phonology: VERIDSPARK_PHONOLOGY,
        orthography:
          "Latin lowercase; hyphen marks bound suffixes such as -mi, -ke, -ko, and -fu."
      }, "reviewer-1");
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
    orthography:
      "Latin lowercase; hyphen marks bound suffixes such as -mi, -ke, and -ko.",
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

async function getLexemeForms(languageId) {
  const lexicon = await api("GET", `/languages/${languageId}/lexicon`, undefined, "reviewer-1");
  if (lexicon.status !== 200 || !Array.isArray(lexicon.json)) {
    fail("List lexicon", `${lexicon.status} ${String(lexicon.text).slice(0, 200)}`);
    return undefined;
  }
  return new Set(lexicon.json.map((lexeme) => String(lexeme.form ?? "").toLowerCase()));
}

async function hasLexemeForm(languageId, form) {
  const lexemeForms = await getLexemeForms(languageId);
  return lexemeForms?.has(form.toLowerCase()) ?? false;
}

function missingGroundedMorphemes(item, lexemeForms) {
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

async function importCorpusPack(languageId, passages, label, options = {}) {
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

async function importExpansionCorpus(languageId) {
  await importCorpusPack(languageId, EXPANSION_PASSAGES, "Corpus expansion");
}

async function importAdvancedCorpus(languageId) {
  await importCorpusPack(languageId, ADVANCED_PASSAGES, "Advanced corpus expansion", { requireLexiconGrounding: true });
}

async function importDiscourseCorpus(languageId) {
  await importCorpusPack(languageId, DISCOURSE_PASSAGES, "Discourse corpus expansion", { requireLexiconGrounding: true });
}

async function importCommandCorpus(languageId) {
  await importCorpusPack(languageId, COMMAND_PASSAGES, "Command/evidential corpus expansion", { requireLexiconGrounding: true });
}

async function importRelationalCorpus(languageId) {
  await importCorpusPack(languageId, RELATIONAL_PASSAGES, "Relational corpus expansion", { requireLexiconGrounding: true });
}

async function importUploadedNotebookCorpus(languageId) {
  await importCorpusPack(languageId, UPLOADED_NOTEBOOK_PASSAGES, "Uploaded notebook corpus expansion", { requireLexiconGrounding: true });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSourceProcessed(languageId, sourceId, label, timeoutMs = 360_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const sources = await api("GET", `/languages/${languageId}/sources`, undefined, "reviewer-1");
    const source = Array.isArray(sources.json)
      ? sources.json.find((item) => item.id === sourceId)
      : undefined;
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

async function acceptProposedDraftsForSource(languageId, sourceId, label) {
  const drafts = await api("GET", `/languages/${languageId}/extraction-drafts?status=proposed`, undefined, "reviewer-1");
  if (drafts.status !== 200 || !Array.isArray(drafts.json)) {
    fail(label, `draft list ${drafts.status} ${String(drafts.text).slice(0, 200)}`);
    return;
  }

  const proposed = drafts.json.filter((draft) => draft.sourceAssetId === sourceId && draft.status === "proposed");
  if (proposed.length === 0) {
    skip(label, "no proposed drafts returned");
    return;
  }

  const bulk = await api("POST", `/languages/${languageId}/extraction-drafts/bulk-review`, {
    action: "accept",
    draftIds: ids(proposed).slice(0, 40)
  }, "reviewer-1");

  if (bulk.status === 200) {
    ok(label, `${bulk.json?.accepted ?? 0} accepted, ${bulk.json?.failed ?? 0} failed`);
  } else {
    fail(label, `${bulk.status} ${String(bulk.text).slice(0, 300)}`);
  }
}

async function processModelSource(languageId, title = SOURCE_TITLE, rawText = MODEL_SOURCE_TEXT, options = {}) {
  const sources = await api("GET", `/languages/${languageId}/sources`, undefined, "reviewer-1");
  const alreadyProcessed = Array.isArray(sources.json)
    && sources.json.some((source) => source.title === title && source.status === "processed");

  if (alreadyProcessed) {
    skip("Model source extraction", `${title} already processed`);
    return;
  }

  const source = await api("POST", `/languages/${languageId}/sources`, {
    kind: "text",
    title,
    rawText
  }, "reviewer-1");

  if (source.status !== 201) {
    fail("Register model source", `${source.status} ${String(source.text).slice(0, 300)}`);
    return;
  }

  const processed = await api("POST", `/sources/${source.json.id}/process`, options.async ? { async: true } : {}, "reviewer-1");
  if (options.async) {
    if (processed.status !== 202) {
      fail("Start async model source", `${processed.status} ${String(processed.text).slice(0, 500)}`);
      return;
    }
    ok("Start async model source", `${title} queued`);
    const finalSource = await waitForSourceProcessed(languageId, source.json.id, "Async model source extraction");
    if (!finalSource) return;
    ok("Async model source extraction", `${finalSource.summary ?? "processed"}${finalSource.warnings?.length ? `, ${finalSource.warnings.length} warnings` : ""}`);
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

  const bulk = await api("POST", `/languages/${languageId}/extraction-drafts/bulk-review`, {
    action: "accept",
    draftIds: ids(proposed).slice(0, 40)
  }, "reviewer-1");

  if (bulk.status === 200) {
    ok("Accept model source drafts", `${bulk.json?.accepted ?? 0} accepted, ${bulk.json?.failed ?? 0} failed`);
  } else {
    fail("Accept model source drafts", `${bulk.status} ${String(bulk.text).slice(0, 300)}`);
  }
}

async function processUploadedNotebookSource(languageId) {
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
  ok("Uploaded source extraction", `${finalSource.summary ?? "processed"}${finalSource.warnings?.length ? `, ${finalSource.warnings.length} warnings` : ""}`);
  await acceptProposedDraftsForSource(languageId, source.id, "Accept uploaded source drafts");
}

async function ensureDiscourseGrounding(languageId) {
  if (await hasLexemeForm(languageId, "poku")) {
    skip("Discourse grounding source", "poku already in lexicon");
    return;
  }

  await processModelSource(
    languageId,
    DISCOURSE_GROUNDING_SOURCE_TITLE,
    DISCOURSE_GROUNDING_SOURCE_TEXT,
    { async: true }
  );
}

async function ensureCommandGrounding(languageId) {
  if (await hasLexemeForm(languageId, "-ne")) {
    skip("Command grounding source", "-ne already in lexicon");
    return;
  }

  await processModelSource(
    languageId,
    COMMAND_GROUNDING_SOURCE_TITLE,
    COMMAND_GROUNDING_SOURCE_TEXT,
    { async: true }
  );
}

async function approveNotes(languageId) {
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
  else if (waitingForDisposition > 0) skip("Approve notes", `${waitingForDisposition} notes waiting for review disposition`);
  else skip("Approve notes", "all notes already approved");
}

async function modelDraftNotes(languageId) {
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

async function authorExercises(languageId) {
  const notes = await api("GET", `/languages/${languageId}/notes`, undefined, "reviewer-1");
  const exercises = await api("GET", `/languages/${languageId}/exercises`, undefined, "reviewer-1");
  const lexemeForms = await getLexemeForms(languageId);
  if (notes.status !== 200 || exercises.status !== 200 || !Array.isArray(notes.json) || !Array.isArray(exercises.json)) {
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

  if (created > 0) ok("Exercise expansion", `${created} created, ${skipped} already present, ${skippedMissingVocabulary} missing vocabulary`);
  else skip("Exercise expansion", `${skipped} exercises already present, ${skippedMissingVocabulary} missing vocabulary`);
}

function searchText(item) {
  return `${item.topic ?? ""} ${item.explanation ?? ""} ${item.textTarget ?? ""} ${item.textTranslation ?? ""}`.toLowerCase();
}

async function assertRelationalExpansion(languageId) {
  const lexemeForms = await getLexemeForms(languageId);
  const corpus = await api("GET", `/languages/${languageId}/corpus`, undefined, "reviewer-1");
  const exercises = await api("GET", `/languages/${languageId}/exercises`, undefined, "reviewer-1");
  if (!lexemeForms || corpus.status !== 200 || exercises.status !== 200) {
    fail("Relational expansion", `lexicon=${Boolean(lexemeForms)}, corpus=${corpus.status}, exercises=${exercises.status}`);
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
    "Translate into Veridspark: Father says, \"Open the door.\""
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
    ok("Relational expansion", `${requiredLexemes.length} lexemes, ${corpusChecks.length} corpus patterns, ${requiredPrompts.length} exercise prompts`);
  }
}

async function assertUploadedNotebookExpansion(languageId) {
  const sources = await api("GET", `/languages/${languageId}/sources`, undefined, "reviewer-1");
  const lexemeForms = await getLexemeForms(languageId);
  const corpus = await api("GET", `/languages/${languageId}/corpus`, undefined, "reviewer-1");
  const exercises = await api("GET", `/languages/${languageId}/exercises`, undefined, "reviewer-1");
  if (sources.status !== 200 || !lexemeForms || corpus.status !== 200 || exercises.status !== 200) {
    fail("Uploaded notebook expansion", `sources=${sources.status}, lexicon=${Boolean(lexemeForms)}, corpus=${corpus.status}, exercises=${exercises.status}`);
    return;
  }

  const source = Array.isArray(sources.json)
    ? sources.json.find((item) => item.title === UPLOADED_NOTEBOOK_SOURCE_TITLE)
    : undefined;
  const hasFileBackedSource = source?.status === "processed"
    && source?.kind === "document"
    && typeof source?.filePath === "string"
    && source.filePath.includes(`/assets/${languageId}/`.replace(/^\/+/, ""))
    && source?.originalName === "veridspark-uploaded-field-notebook-v1.txt";
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
    ok("Uploaded notebook expansion", `${requiredLexemes.length} lexemes, ${corpusChecks.length} corpus patterns, ${requiredPrompts.length} exercise prompts`);
  }
}

function selectIdsByPriority(items, predicates, fallback = []) {
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

function latestAssistantMessage(session) {
  const assistantMessages = (session?.messages ?? []).filter((message) => message.role === "assistant");
  return assistantMessages[assistantMessages.length - 1]?.content ?? "";
}

function assistantMentionsMorpheme(text, morpheme) {
  if ((morpheme.startsWith("-") || morpheme.endsWith("-")) && text.includes(morpheme)) {
    return true;
  }
  return new RegExp(`(^|[^A-Za-z0-9])${morpheme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`).test(text);
}

async function runLiveModelChecks(languageId) {
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

  const ai = await api("POST", "/ai/sessions", {
    languageId,
    mode: "programmer_debug",
    seedPrompt:
      "Using only the supplied Veridspark context, explain in five short bullets how negation, tense/person suffixes, progressive aspect, imperative mood, and reported evidential marking work. Name the exact progressive, imperative, and reported-evidential suffixes.",
    contextNoteIds,
    contextPassageIds
  }, "programmer-1");

  if (ai.status === 201) {
    const assistant = latestAssistantMessage(ai.json);
    if (assistant.length > 20 && !assistant.toLowerCase().includes("deterministic fallback")) {
      ok("AI session live reply", assistant.replace(/\s+/g, " ").slice(0, 180));
    } else {
      fail("AI session live reply", `weak assistant response: ${assistant.slice(0, 200)}`);
    }

    const followUp = await api("POST", `/ai/sessions/${encodeURIComponent(ai.json.id)}/messages`, {
      content: "According to the supplied Veridspark examples, which suffix marks progressive aspect? Answer with the suffix and one short reason."
    }, "programmer-1");
    const followUpAssistant = latestAssistantMessage(followUp.json);
    if (
      followUp.status === 200
      && followUp.json?.status === "active"
      && followUpAssistant.length > 10
      && assistantMentionsMorpheme(followUpAssistant, "-se")
      && !followUpAssistant.toLowerCase().includes("deterministic fallback")
      && followUp.json?.privacy?.exposesHiddenChainOfThought === false
    ) {
      ok("AI session follow-up", followUpAssistant.replace(/\s+/g, " ").slice(0, 180));
    } else {
      fail("AI session follow-up", `${followUp.status}; expected -se for progressive aspect; got ${followUpAssistant.replace(/\s+/g, " ").slice(0, 300) || String(followUp.text).slice(0, 300)}`);
    }

    const commandFollowUp = await api("POST", "/ai/sessions", {
      languageId,
      mode: "programmer_debug",
      seedPrompt: "Using only the supplied command/evidential Veridspark context, which suffix marks imperative mood and which suffix marks reported evidential meaning? Answer with -ro and -ne. Do not use the quotative particle vo as the reported evidential suffix.",
      contextNoteIds: commandContextNoteIds,
      contextPassageIds: commandContextPassageIds
    }, "programmer-1");
    const commandAssistant = latestAssistantMessage(commandFollowUp.json);
    if (
      commandFollowUp.status === 201
      && commandFollowUp.json?.status === "active"
      && assistantMentionsMorpheme(commandAssistant, "-ro")
      && assistantMentionsMorpheme(commandAssistant, "-ne")
      && !commandAssistant.toLowerCase().includes("deterministic fallback")
      && commandFollowUp.json?.privacy?.exposesHiddenChainOfThought === false
    ) {
      ok("AI session command/evidential follow-up", commandAssistant.replace(/\s+/g, " ").slice(0, 180));
    } else {
      fail("AI session command/evidential follow-up", `${commandFollowUp.status}; expected -ro and -ne; got ${commandAssistant.replace(/\s+/g, " ").slice(0, 300) || String(commandFollowUp.text).slice(0, 300)}`);
    }

    const relationalFollowUp = await api("POST", `/ai/sessions/${encodeURIComponent(ai.json.id)}/messages`, {
      content: "According to the supplied Veridspark examples, what marks possessed nouns, what marks comparison, and what marks quoted speech? Answer with -sa, eka, and vo."
    }, "programmer-1");
    const relationalAssistant = latestAssistantMessage(relationalFollowUp.json);
    if (
      relationalFollowUp.status === 200
      && relationalFollowUp.json?.status === "active"
      && assistantMentionsMorpheme(relationalAssistant, "-sa")
      && assistantMentionsMorpheme(relationalAssistant, "eka")
      && assistantMentionsMorpheme(relationalAssistant, "vo")
      && !relationalAssistant.toLowerCase().includes("deterministic fallback")
      && relationalFollowUp.json?.privacy?.exposesHiddenChainOfThought === false
    ) {
      ok("AI session relational follow-up", relationalAssistant.replace(/\s+/g, " ").slice(0, 180));
    } else {
      fail("AI session relational follow-up", `${relationalFollowUp.status}; expected -sa, eka, and vo; got ${relationalAssistant.replace(/\s+/g, " ").slice(0, 300) || String(relationalFollowUp.text).slice(0, 300)}`);
    }
  } else {
    fail("AI session live reply", `${ai.status} ${String(ai.text).slice(0, 500)}`);
  }

  const learnerSession = await api("POST", "/ai/sessions", {
    languageId,
    mode: "learner_practice",
    seedPrompt:
      "You are tutoring a Veridspark learner. In two short sentences, explain what -li means in ravo-mi-ki-li and give the English meaning of niru ravo-mi-ki-li saku lira-mi-ki. Include the suffix -li.",
    contextNoteIds,
    contextPassageIds
  }, "learner-1");
  const learnerAssistant = latestAssistantMessage(learnerSession.json);
  if (
    learnerSession.status === 201
    && learnerSession.json?.mode === "learner_practice"
    && assistantMentionsMorpheme(learnerAssistant, "-li")
    && learnerAssistant.toLowerCase().includes("after")
    && !learnerAssistant.toLowerCase().includes("deterministic fallback")
    && learnerSession.json?.privacy?.exposesHiddenChainOfThought === false
  ) {
    ok("AI learner-practice session", learnerAssistant.replace(/\s+/g, " ").slice(0, 180));
  } else {
    fail("AI learner-practice session", `${learnerSession.status}; expected -li learner explanation; got ${learnerAssistant.replace(/\s+/g, " ").slice(0, 300) || String(learnerSession.text).slice(0, 300)}`);
  }

  const elderSession = await api("POST", "/ai/sessions", {
    languageId,
    mode: "elder_review",
    seedPrompt:
      "You are helping an Elder review Veridspark notes. In three bullets, identify the markers for possession, quotation, and contrast. Answer with -sa, vo, and pira.",
    contextNoteIds,
    contextPassageIds
  }, "elder-1");
  const elderAssistant = latestAssistantMessage(elderSession.json);
  if (
    elderSession.status === 201
    && elderSession.json?.mode === "elder_review"
    && assistantMentionsMorpheme(elderAssistant, "-sa")
    && assistantMentionsMorpheme(elderAssistant, "vo")
    && assistantMentionsMorpheme(elderAssistant, "pira")
    && !elderAssistant.toLowerCase().includes("deterministic fallback")
    && elderSession.json?.privacy?.exposesHiddenChainOfThought === false
  ) {
    ok("AI elder-review session", elderAssistant.replace(/\s+/g, " ").slice(0, 180));
  } else {
    fail("AI elder-review session", `${elderSession.status}; expected -sa, vo, and pira; got ${elderAssistant.replace(/\s+/g, " ").slice(0, 300) || String(elderSession.text).slice(0, 300)}`);
  }

  const generatedExercise = await api("POST", `/languages/${languageId}/exercises/generate`, {
    type: "translate_to_english"
  }, "reviewer-1");

  if (generatedExercise.status === 200 && generatedExercise.json?.exercise?.prompt) {
    ok("Model exercise generation", generatedExercise.json.exercise.prompt.slice(0, 160));
  } else {
    fail("Model exercise generation", `${generatedExercise.status} ${String(generatedExercise.text).slice(0, 500)}`);
  }
}

async function runPracticeAndEvaluation(languageId) {
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
      ["Translate into Veridspark: In the morning, we usually gather fish with a net.", "lenu-ke fira penu-ve tima-mi-nu-mu"],
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
      ["Translate into Veridspark: Father says, \"Open the door.\"", "meka pavo-ro vo tara kora-mi-ki"],
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

async function ensureGovernanceRecord(languageId) {
  const governance = await api("GET", "/governance", undefined, "reviewer-1");
  if (governance.status !== 200 || !Array.isArray(governance.json)) {
    fail("Governance policy", `${governance.status} ${String(governance.text).slice(0, 300)}`);
    return;
  }

  const existing = governance.json.find((record) => (
    record.languageId === languageId && record.content === GOVERNANCE_POLICY_CONTENT
  ));
  if (existing) {
    skip("Governance policy", "verification policy already present");
    return;
  }

  const created = await api("POST", "/governance", {
    languageId,
    policyType: "generation",
    content: GOVERNANCE_POLICY_CONTENT,
    effectiveDate: "2026-07-07"
  }, "elder-1");

  if (created.status === 201 && created.json?.content === GOVERNANCE_POLICY_CONTENT) {
    ok("Governance policy", created.json.id);
  } else {
    fail("Governance policy", `${created.status} ${String(created.text).slice(0, 300)}`);
  }
}

function noteSearchText(note) {
  return `${note.topic ?? ""} ${note.explanation ?? ""}`.toLowerCase();
}

async function runElderCorrectionWorkflow(languageId) {
  const corrections = await api("GET", `/elder/corrections?languageId=${encodeURIComponent(languageId)}`, undefined, "elder-1");
  if (corrections.status !== 200 || !Array.isArray(corrections.json)) {
    fail("Elder correction workflow", `list ${corrections.status} ${String(corrections.text).slice(0, 300)}`);
    return;
  }

  const existing = corrections.json.find((correction) => (
    correction.rationale === ELDER_WORKFLOW_RATIONALE && correction.status === "applied"
  ));
  if (existing) {
    ok("Elder correction workflow", `${existing.id} already applied`);
  } else {
    const notes = await api("GET", `/languages/${languageId}/notes`, undefined, "reviewer-1");
    if (notes.status !== 200 || !Array.isArray(notes.json)) {
      fail("Elder correction workflow", `notes ${notes.status} ${String(notes.text).slice(0, 300)}`);
      return;
    }

    const targetNote = notes.json.find((note) => noteSearchText(note).includes("evidential") && noteSearchText(note).includes("-ne"))
      ?? notes.json.find((note) => noteSearchText(note).includes("imperative") && noteSearchText(note).includes("-ro"))
      ?? notes.json[0];
    if (!targetNote) {
      fail("Elder correction workflow", "no note available for correction");
      return;
    }

    const submitted = await api("POST", "/elder/corrections", {
      languageId,
      noteId: targetNote.id,
      correction: "Clarify that -ne marks reported evidential meaning after the full finite verb complex.",
      rationale: ELDER_WORKFLOW_RATIONALE,
      severity: "minor",
      contextText: targetNote.explanation
    }, "elder-1");
    if (submitted.status !== 201 || submitted.json?.status !== "pending_review") {
      fail("Elder correction workflow", `submit ${submitted.status} ${String(submitted.text).slice(0, 300)}`);
      return;
    }

    const reviewed = await api("PATCH", `/elder/corrections/${encodeURIComponent(submitted.json.id)}/review`, {
      status: "accepted"
    }, "elder-1");
    if (reviewed.status !== 200 || reviewed.json?.status !== "accepted") {
      fail("Elder correction workflow", `review ${reviewed.status} ${String(reviewed.text).slice(0, 300)}`);
      return;
    }

    const baseExplanation = String(targetNote.explanation ?? "")
      .replace(/\s*Elder-verified clarification: -ne marks reported evidential meaning after the whole finite verb complex\.$/, "")
      .trim();
    const applied = await api("PATCH", `/elder/corrections/${encodeURIComponent(submitted.json.id)}/apply`, {
      explanation: `${baseExplanation} ${ELDER_VERIFIED_CLARIFICATION}`.trim()
    }, "elder-1");

    if (
      applied.status === 200
      && applied.json?.correction?.status === "applied"
      && String(applied.json?.note?.explanation ?? "").includes(ELDER_VERIFIED_CLARIFICATION)
    ) {
      ok("Elder correction workflow", `${applied.json.correction.id} applied to ${targetNote.id}`);
    } else {
      fail("Elder correction workflow", `apply ${applied.status} ${String(applied.text).slice(0, 300)}`);
      return;
    }
  }

  const context = await api("GET", `/languages/${languageId}/elder-context`, undefined, "elder-1");
  const hasPolicy = Array.isArray(context.json?.governance)
    && context.json.governance.some((record) => record.content === GOVERNANCE_POLICY_CONTENT);
  const hasCorrection = Array.isArray(context.json?.corrections)
    && context.json.corrections.some((correction) => correction.rationale === ELDER_WORKFLOW_RATIONALE);
  if (context.status === 200 && hasPolicy && hasCorrection) {
    ok("Elder context", `${context.json.corrections.length} corrections, ${context.json.governance.length} governance records`);
  } else {
    fail("Elder context", `${context.status}; policy=${hasPolicy}; correction=${hasCorrection}`);
  }
}

async function runReviewDispositionWorkflow(languageId) {
  const dispositions = await api("GET", `/languages/${languageId}/review-dispositions`, undefined, "elder-1");
  if (dispositions.status !== 200 || !Array.isArray(dispositions.json)) {
    fail("Review disposition workflow", `list ${dispositions.status} ${String(dispositions.text).slice(0, 300)}`);
    return;
  }

  const existingResolved = dispositions.json.find((disposition) => (
    disposition.reason === REVIEW_DISPOSITION_REASON && disposition.status === "resolved"
  ));
  if (existingResolved) {
    ok("Review disposition workflow", `${existingResolved.id} already resolved`);
  } else {
    let openDisposition = dispositions.json.find((disposition) => (
      disposition.reason === REVIEW_DISPOSITION_REASON && disposition.status === "open"
    ));

    if (!openDisposition) {
      const notes = await api("GET", `/languages/${languageId}/notes`, undefined, "reviewer-1");
      if (notes.status !== 200 || !Array.isArray(notes.json)) {
        fail("Review disposition workflow", `notes ${notes.status} ${String(notes.text).slice(0, 300)}`);
        return;
      }

      const targetNote = notes.json.find((note) => noteSearchText(note).includes("progressive") && noteSearchText(note).includes("-se"))
        ?? notes.json.find((note) => noteSearchText(note).includes("evidential") && noteSearchText(note).includes("-ne"))
        ?? notes.json[0];
      if (!targetNote) {
        fail("Review disposition workflow", "no note available for disposition");
        return;
      }

      const reviewed = await api("PATCH", `/notes/${encodeURIComponent(targetNote.id)}/review`, {
        status: "escalated",
        reviewerComment: REVIEW_DISPOSITION_REASON,
        dispositionAssigneeId: "elder-1",
        dispositionDueAt: "2026-07-14"
      }, "reviewer-1");
      if (reviewed.status !== 200 || reviewed.json?.status !== "escalated") {
        fail("Review disposition workflow", `open ${reviewed.status} ${String(reviewed.text).slice(0, 300)}`);
        return;
      }

      const refreshed = await api("GET", `/languages/${languageId}/review-dispositions`, undefined, "elder-1");
      openDisposition = Array.isArray(refreshed.json)
        ? refreshed.json.find((disposition) => disposition.reason === REVIEW_DISPOSITION_REASON && disposition.status === "open")
        : undefined;
      if (!openDisposition) {
        fail("Review disposition workflow", `open disposition not found after note review: ${refreshed.status}`);
        return;
      }
    }

    const resolved = await api("PATCH", "/review-dispositions/resolve", {
      dispositionId: openDisposition.id,
      resolutionSummary: REVIEW_DISPOSITION_RESOLUTION
    }, "elder-1");
    if (
      resolved.status === 200
      && resolved.json?.status === "resolved"
      && resolved.json?.resolutionSummary === REVIEW_DISPOSITION_RESOLUTION
    ) {
      ok("Review disposition workflow", `${resolved.json.id} resolved`);
    } else {
      fail("Review disposition workflow", `resolve ${resolved.status} ${String(resolved.text).slice(0, 300)}`);
      return;
    }
  }

  const audit = await api("GET", `/audit/events?languageId=${encodeURIComponent(languageId)}`, undefined, "programmer-1");
  const hasDispositionAudit = Array.isArray(audit.json)
    && audit.json.some((event) => (
      event.action === "review_disposition.resolved"
      && String(event.summary ?? "").includes("Resolved")
    ));
  if (audit.status === 200 && hasDispositionAudit) {
    ok("Audit ledger", `${audit.json.length} language audit events include disposition resolution`);
  } else {
    fail("Audit ledger", `${audit.status}; dispositionResolution=${hasDispositionAudit}`);
  }
}

async function assertObservabilityAndNeuralMap(languageId) {
  const sessions = await api("GET", "/observability/ai-sessions", undefined, "programmer-1");
  if (
    sessions.status === 200
    && sessions.json?.totals?.sessions > 0
    && sessions.json?.totals?.messages > 0
    && sessions.json?.totals?.elderCorrections > 0
  ) {
    ok("AI observability", `${sessions.json.totals.sessions} sessions, ${sessions.json.totals.elderCorrections} elder corrections`);
  } else {
    fail("AI observability", `${sessions.status} ${String(sessions.text).slice(0, 300)}`);
  }

  const metrics = await api("GET", "/observability/metrics", undefined, "programmer-1");
  if (metrics.status === 200 && metrics.json?.storage?.ok === true && metrics.json?.requests?.total > 0) {
    ok("System observability", `${metrics.json.requests.total} requests, queue ${metrics.json.jobQueue?.pending ?? "?"}/${metrics.json.jobQueue?.active ?? "?"}`);
  } else {
    fail("System observability", `${metrics.status} ${String(metrics.text).slice(0, 300)}`);
  }

  const neuralMap = await api("GET", `/observability/neural-map?languageId=${encodeURIComponent(languageId)}`, undefined, "programmer-1");
  const nodeTypes = new Set((neuralMap.json?.nodes ?? []).map((node) => node.type));
  const edgeRelations = new Set((neuralMap.json?.edges ?? []).map((edge) => edge.relation));
  const requiredNodeTypes = ["language", "corpus", "note", "exercise", "ai_session", "elder_correction"];
  const missingNodeTypes = requiredNodeTypes.filter((type) => !nodeTypes.has(type));
  const requiredEdgeRelations = ["has_corpus", "has_note", "has_exercise", "generated", "proposed_correction"];
  const missingEdgeRelations = requiredEdgeRelations.filter((relation) => !edgeRelations.has(relation));

  if (neuralMap.status === 200 && missingNodeTypes.length === 0 && missingEdgeRelations.length === 0) {
    ok("Neural map observability", `${neuralMap.json.nodes.length} nodes, ${neuralMap.json.edges.length} edges`);
  } else {
    fail("Neural map observability", `${neuralMap.status}; missing nodes=${missingNodeTypes.join(",") || "none"}; missing edges=${missingEdgeRelations.join(",") || "none"}`);
  }
}

async function assertProfileCoverage(languageId) {
  const profile = await api("GET", `/languages/${languageId}/profile`, undefined, "reviewer-1");
  if (profile.status !== 200) {
    fail("Profile coverage", `${profile.status} ${String(profile.text).slice(0, 300)}`);
    return;
  }

  const stats = profile.json?.stats ?? {};
  const morphemes = profile.json?.morphemeInventory?.length ?? 0;
  const checks = [
    ["vocabularyItems", stats.vocabularyItems ?? 0, 120],
    ["corpusPassages", stats.corpusPassages ?? 0, 74],
    ["grammarRules", stats.grammarRules ?? 0, 52],
    ["exercises", stats.exercises ?? 0, 43],
    ["morphemeInventory", morphemes, 112]
  ];

  const failures = checks
    .filter(([, actual, minimum]) => actual < minimum)
    .map(([label, actual, minimum]) => `${label} ${actual}/${minimum}`);

  if (failures.length > 0) {
    fail("Profile coverage", failures.join("; "));
  } else {
    ok("Profile coverage", checks.map(([label, actual]) => `${label}=${actual}`).join(", "));
  }
}

async function assertProfileStructure(languageId) {
  const profile = await api("GET", `/languages/${languageId}/profile`, undefined, "reviewer-1");
  if (profile.status !== 200) {
    fail("Profile structure", `${profile.status} ${String(profile.text).slice(0, 300)}`);
    return;
  }

  const morphemes = Array.isArray(profile.json?.morphemeInventory) ? profile.json.morphemeInventory : [];
  const requiredMorphemes = [
    ["-li", "sequential"],
    ["pira", "but"],
    ["ano", "and"],
    ["-sa", "possessed"],
    ["vo", "quotative"]
  ];
  const missingMorphemes = requiredMorphemes
    .filter(([surface, gloss]) => {
      const entry = morphemes.find((item) => item.surface === surface);
      return !entry
        || entry.occurrenceCount < 1
        || !Array.isArray(entry.glosses)
        || !entry.glosses.some((item) => String(item).toLowerCase().includes(gloss))
        || !entry.vocabulary;
    })
    .map(([surface]) => surface);

  const exerciseTypes = profile.json?.stats?.exerciseTypes ?? {};
  const missingExerciseTypes = ["translate_to_target", "translate_to_english", "segment", "choose_particle"]
    .filter((type) => Number(exerciseTypes[type] ?? 0) <= 0);

  const aliasValues = new Set([
    "past tense",
    "present tense",
    "future tense",
    "first person singular",
    "1st person singular",
    "second person singular",
    "2nd person singular",
    "third person singular",
    "3rd person singular",
    "first person plural",
    "1st person plural"
  ]);
  const paradigmGaps = Array.isArray(profile.json?.paradigmGaps) ? profile.json.paradigmGaps : [];
  const aliasGapValues = paradigmGaps
    .flatMap((gap) => [...(gap.attested ?? []), ...(gap.missing ?? [])])
    .map((value) => String(value).toLowerCase())
    .filter((value) => aliasValues.has(value));

  const failures = [
    missingMorphemes.length > 0 ? `morphemes ${missingMorphemes.join(", ")}` : "",
    missingExerciseTypes.length > 0 ? `exerciseTypes ${missingExerciseTypes.join(", ")}` : "",
    aliasGapValues.length > 0 ? `paradigm alias values ${[...new Set(aliasGapValues)].join(", ")}` : ""
  ].filter(Boolean);

  if (failures.length > 0) {
    fail("Profile structure", failures.join("; "));
  } else {
    ok("Profile structure", `${requiredMorphemes.length} morphemes linked, ${Object.keys(exerciseTypes).length} exercise types, ${paradigmGaps.length} normalized gaps`);
  }
}

function hasValidContentHash(exportObject) {
  return /^[a-f0-9]{64}$/.test(String(exportObject?.integrity?.contentHash ?? ""));
}

function jsonHasField(serializedJson, field) {
  return new RegExp(`"${field}"\\s*:`).test(serializedJson);
}

async function assertPublicExports(languageId) {
  const snapshot = await api("GET", `/exports/languages/${languageId}/snapshot`, undefined, "reviewer-1");
  if (snapshot.status !== 200) {
    fail("Language snapshot export", `${snapshot.status} ${String(snapshot.text).slice(0, 300)}`);
  } else {
    const stats = snapshot.json?.linguisticProfile?.stats ?? {};
    const snapshotText = JSON.stringify(snapshot.json);
    const protectedFields = ["expectedAnswers", "adversarialAnswers", "gradingExplanation", "learnerId", "answer"];
    const leakedFields = protectedFields.filter((field) => jsonHasField(snapshotText, field));
    const hasGovernancePolicy = Array.isArray(snapshot.json?.governance)
      && snapshot.json.governance.some((record) => record.content === GOVERNANCE_POLICY_CONTENT);
    if (
      snapshot.json?.exportVersion === "language-snapshot-v2"
      && hasValidContentHash(snapshot.json)
      && stats.vocabularyItems >= 94
      && stats.corpusPassages >= 56
      && Array.isArray(snapshot.json?.exercises)
      && snapshot.json.exercises.length >= 33
      && leakedFields.length === 0
      && hasGovernancePolicy
    ) {
      ok("Language snapshot export", `${stats.vocabularyItems} vocab, ${stats.corpusPassages} corpus, ${snapshot.json.exercises.length} public exercises`);
    } else {
      fail("Language snapshot export", `invalid snapshot contract; leaked=${leakedFields.join(",") || "none"} governance=${hasGovernancePolicy} stats=${JSON.stringify(stats).slice(0, 160)}`);
    }
  }

  const artifact = await api("GET", "/exports/evaluations/artifact", undefined, "reviewer-1");
  if (artifact.status !== 200) {
    fail("Evaluation artifact export", `${artifact.status} ${String(artifact.text).slice(0, 300)}`);
    return;
  }

  const latestRuns = Array.isArray(artifact.json?.latestRuns) ? artifact.json.latestRuns : [];
  if (
    artifact.json?.exportVersion === "evaluation-artifact-v2"
    && hasValidContentHash(artifact.json)
    && artifact.json?.summary?.totalRuns > 0
    && latestRuns.some((run) => run.languageId === languageId)
  ) {
    ok("Evaluation artifact export", `${artifact.json.summary.totalRuns} total runs, latest includes ${languageId}`);
  } else {
    fail("Evaluation artifact export", `invalid artifact contract ${String(artifact.text).slice(0, 300)}`);
  }
}

async function main() {
  console.log(`\n=== AssiniLang local model verification @ ${API} ===\n`);

  const health = await directJson(`${API}/health`).catch((error) => ({ error }));
  if (health.status !== 200) {
    fail("API health", health.error instanceof Error ? health.error.message : JSON.stringify(health).slice(0, 200));
    summaryAndExit();
  }
  ok("API health", "running");

  await configurePreferredModel();

  const language = await ensureLanguage();
  if (!language) summaryAndExit();

  await importExpansionCorpus(language.id);
  await processModelSource(language.id);
  await processModelSource(language.id, ADVANCED_SOURCE_TITLE, ADVANCED_MODEL_SOURCE_TEXT);
  await approveNotes(language.id);
  await importAdvancedCorpus(language.id);
  await approveNotes(language.id);
  await processModelSource(language.id, DISCOURSE_SOURCE_TITLE, DISCOURSE_MODEL_SOURCE_TEXT, { async: true });
  await approveNotes(language.id);
  await ensureDiscourseGrounding(language.id);
  await approveNotes(language.id);
  await importDiscourseCorpus(language.id);
  await approveNotes(language.id);
  await processModelSource(language.id, COMMAND_SOURCE_TITLE, COMMAND_MODEL_SOURCE_TEXT, { async: true });
  await approveNotes(language.id);
  await ensureCommandGrounding(language.id);
  await approveNotes(language.id);
  await importCommandCorpus(language.id);
  await approveNotes(language.id);
  await processModelSource(language.id, RELATIONAL_SOURCE_TITLE, RELATIONAL_MODEL_SOURCE_TEXT, { async: true });
  await approveNotes(language.id);
  await importRelationalCorpus(language.id);
  await approveNotes(language.id);
  await processUploadedNotebookSource(language.id);
  await approveNotes(language.id);
  await importUploadedNotebookCorpus(language.id);
  await approveNotes(language.id);
  await modelDraftNotes(language.id);
  await approveNotes(language.id);
  await authorExercises(language.id);
  await assertRelationalExpansion(language.id);
  await assertUploadedNotebookExpansion(language.id);
  await runLiveModelChecks(language.id);
  await runPracticeAndEvaluation(language.id);
  await ensureGovernanceRecord(language.id);
  await runElderCorrectionWorkflow(language.id);
  await runReviewDispositionWorkflow(language.id);
  await approveNotes(language.id);
  await assertObservabilityAndNeuralMap(language.id);
  await assertProfileCoverage(language.id);
  await assertProfileStructure(language.id);
  await assertPublicExports(language.id);

  summaryAndExit();
}

main().catch((error) => {
  fail("Verifier crashed", error instanceof Error ? error.stack ?? error.message : String(error));
  summaryAndExit();
});
