import { META, CONSENT } from "./verifyLocalModelRuntime.mjs";

export function seg(parts) {
  return parts.map(([surface, lemma, gloss, features]) => ({
    surface,
    lemma,
    gloss,
    features: Array.isArray(features) ? features : [features]
  }));
}

export function passage(textTarget, textTranslation, tags, parts) {
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

export const EXPANSION_PASSAGES = [
  passage(
    "tara saku nemi-mi-ki",
    "Father teaches the child.",
    ["family", "teaching", "present"],
    [
      ["tara", "tara", "father", "noun"],
      ["saku", "saku", "child", "noun"],
      ["nemi", "nemi", "teach", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "saku liru lira-fu-ki",
    "The child will sing the song.",
    ["music", "future"],
    [
      ["saku", "saku", "child", "noun"],
      ["liru", "liru", "song", "noun"],
      ["lira", "lira", "sing", "verb-root"],
      ["-fu", "-fu", "future", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "niru mira-ke naru-mi-ki",
    "The friend comes to the river.",
    ["motion", "locative", "friendship"],
    [
      ["niru", "niru", "friend", "noun"],
      ["mira", "mira", "river", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["naru", "naru", "come", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "mara toru kira-mi-ta",
    "You give drinking water to mother.",
    ["kinship", "giving", "second-person"],
    [
      ["mara", "mara", "mother", "noun"],
      ["toru", "toru", "drinking water", "noun"],
      ["kira", "kira", "give", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ta", "-ta", "2sg", "person"]
    ]
  ),
  passage(
    "kuma-ke savu-mi-mu",
    "We learn during the day.",
    ["time", "learning", "locative"],
    [
      ["kuma", "kuma", "day", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["savu", "savu", "learn", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  ),
  passage(
    "vaku sora-lo-na",
    "I saw the fire.",
    ["perception", "past", "first-person"],
    [
      ["vaku", "vaku", "fire", "noun"],
      ["sora", "sora", "see", "verb-root"],
      ["-lo", "-lo", "past", "tense"],
      ["-na", "-na", "1sg", "person"]
    ]
  ),
  passage(
    "raki-ko tiru",
    "Eating is good.",
    ["nominalization", "evaluation"],
    [
      ["raki", "raki", "eat", "verb-root"],
      ["-ko", "-ko", "nominalizer", "derivation"],
      ["tiru", "tiru", "good", "adjective"]
    ]
  ),
  passage(
    "saku ma silu-mi-ki",
    "The child does not sleep.",
    ["negation", "rest"],
    [
      ["saku", "saku", "child", "noun"],
      ["ma", "ma", "negation", "particle"],
      ["silu", "silu", "sleep", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "vima-ke talo-fu-mu",
    "We will walk at the mountain.",
    ["motion", "future", "locative"],
    [
      ["vima", "vima", "mountain", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["talo", "talo", "walk", "verb-root"],
      ["-fu", "-fu", "future", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  ),
  passage(
    "piru sora-mi-ta",
    "You see the sky.",
    ["perception", "second-person"],
    [
      ["piru", "piru", "sky", "noun"],
      ["sora", "sora", "see", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ta", "-ta", "2sg", "person"]
    ]
  ),
  passage(
    "suri-ke toru raki-lo-ki",
    "At the river-bank, he drank water.",
    ["water", "past", "locative"],
    [
      ["suri", "suri", "river-bank", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["toru", "toru", "drinking water", "noun"],
      ["raki", "raki", "eat", "verb-root"],
      ["-lo", "-lo", "past", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "laka-ke kora-mi-na",
    "I speak at the tree.",
    ["speech", "locative", "first-person"],
    [
      ["laka", "laka", "tree", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["kora", "kora", "speak", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-na", "-na", "1sg", "person"]
    ]
  )
];

export const MODEL_SOURCE_TEXT = `
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

export const ADVANCED_MODEL_SOURCE_TEXT = `
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

export const DISCOURSE_MODEL_SOURCE_TEXT = `
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

export const DISCOURSE_GROUNDING_SOURCE_TEXT = `
Veridspark discourse answer lexeme grounding patch

New lexical probe:
poku = answer; verb root used for replying to a question

Example:
poku-mi-na means I answer.

Grammar probe:
The verb root poku takes the normal tense-person suffix chain: poku-mi-na is answer-PRES-1SG.
`.trim();

export const COMMAND_MODEL_SOURCE_TEXT = `
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

export const COMMAND_GROUNDING_SOURCE_TEXT = `
Veridspark reported evidential grounding patch

New lexical probe:
-ne = reported evidential suffix meaning reportedly or they say

Examples:
ravo-mi-ki-ne means they say she returns.
kora-mi-ki-ne means they say she speaks.

Grammar probe:
The reported evidential suffix -ne attaches after the whole finite verb complex: ravo-mi-ki-ne is return-PRES-3SG-REP.
`.trim();

export const RELATIONAL_MODEL_SOURCE_TEXT = `
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

export const UPLOADED_NOTEBOOK_SOURCE_TEXT = `
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

export const ADVANCED_PASSAGES = [
  passage(
    "nalo-ke saku-pa sepa-mi-se-ki",
    "The children are waiting in the garden.",
    ["garden", "plural", "progressive"],
    [
      ["nalo", "nalo", "garden", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["saku", "saku", "child", "noun"],
      ["-pa", "-pa", "plural", "number"],
      ["sepa", "sepa", "wait", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-se", "-se", "progressive", "aspect"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "mavi tave-fu-na",
    "I will carry the cloth.",
    ["carrying", "future", "first-person"],
    [
      ["mavi", "mavi", "cloth", "noun"],
      ["tave", "tave", "carry", "verb-root"],
      ["-fu", "-fu", "future", "tense"],
      ["-na", "-na", "1sg", "person"]
    ]
  ),
  passage(
    "telu leno-mi-mu",
    "We remember the story.",
    ["memory", "first-person-plural"],
    [
      ["telu", "telu", "story", "noun"],
      ["leno", "leno", "remember", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  ),
  passage(
    "rinu-ke niru tave-lo-ki",
    "The friend carried along the path.",
    ["path", "past", "friendship"],
    [
      ["rinu", "rinu", "path", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["niru", "niru", "friend", "noun"],
      ["tave", "tave", "carry", "verb-root"],
      ["-lo", "-lo", "past", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "pavo-mi-ta vi",
    "Do you open it?",
    ["question", "second-person"],
    [
      ["pavo", "pavo", "open", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ta", "-ta", "2sg", "person"],
      ["vi", "vi", "yes-no question", "particle"]
    ]
  ),
  passage(
    "ma neru-mi-na",
    "I do not close it.",
    ["negation", "first-person"],
    [
      ["ma", "ma", "negation", "particle"],
      ["neru", "neru", "close", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-na", "-na", "1sg", "person"]
    ]
  ),
  passage(
    "sela-pa lavo-mi-mu",
    "We trade shells.",
    ["trade", "plural"],
    [
      ["sela", "sela", "shell", "noun"],
      ["-pa", "-pa", "plural", "number"],
      ["lavo", "lavo", "trade", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  ),
  passage(
    "tara-ri niru-ve kora-mi-se-ki",
    "Honored father is speaking with the friend.",
    ["honorific", "comitative", "progressive"],
    [
      ["tara", "tara", "father", "noun"],
      ["-ri", "-ri", "honorific", "derivation"],
      ["niru", "niru", "friend", "noun"],
      ["-ve", "-ve", "comitative", "case"],
      ["kora", "kora", "speak", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-se", "-se", "progressive", "aspect"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "nala-ke senu lira-mi-ki vi",
    "Does the bird sing in the rain?",
    ["rain", "question", "music"],
    [
      ["nala", "nala", "rain", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["senu", "senu", "bird", "noun"],
      ["lira", "lira", "sing", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["vi", "vi", "yes-no question", "particle"]
    ]
  ),
  passage(
    "vori-ko tiru",
    "Protecting is good.",
    ["nominalization", "protection"],
    [
      ["vori", "vori", "protect", "verb-root"],
      ["-ko", "-ko", "nominalizer", "derivation"],
      ["tiru", "tiru", "good", "adjective"]
    ]
  ),
  passage(
    "kemu-pa mira-ke tima-mi-mu",
    "We gather baskets at the river.",
    ["basket", "plural", "locative"],
    [
      ["kemu", "kemu", "basket", "noun"],
      ["-pa", "-pa", "plural", "number"],
      ["mira", "mira", "river", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["tima", "tima", "gather", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  ),
  passage(
    "moku-mi-se-ta vi",
    "Are you listening?",
    ["listening", "progressive", "question"],
    [
      ["moku", "moku", "listen", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-se", "-se", "progressive", "aspect"],
      ["-ta", "-ta", "2sg", "person"],
      ["vi", "vi", "yes-no question", "particle"]
    ]
  )
];

export const DISCOURSE_PASSAGES = [
  passage(
    "lenu-ke fira penu-ve tima-mi-nu-mu",
    "In the morning, we usually gather fish with a net.",
    ["habitual", "tool", "morning"],
    [
      ["lenu", "lenu", "morning", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["fira", "fira", "fish", "noun"],
      ["penu", "penu", "net", "noun"],
      ["-ve", "-ve", "comitative", "case"],
      ["tima", "tima", "gather", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-nu", "-nu", "habitual", "aspect"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  ),
  passage(
    "namo-ke milu lavo-mi-mu",
    "We trade salt at the market.",
    ["market", "trade", "locative"],
    [
      ["namo", "namo", "market", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["milu", "milu", "salt", "noun"],
      ["lavo", "lavo", "trade", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  ),
  passage(
    "niru talo-mi-ki-la niru ravo-fu-ki",
    "If the friend walks, the friend will return.",
    ["conditional", "motion", "future"],
    [
      ["niru", "niru", "friend", "noun"],
      ["talo", "talo", "walk", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["-la", "-la", "conditional", "clause-suffix"],
      ["niru", "niru", "friend", "noun"],
      ["ravo", "ravo", "return", "verb-root"],
      ["-fu", "-fu", "future", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "saku keso-mi-ta vi",
    "Do you ask the child?",
    ["question", "speech", "second-person"],
    [
      ["saku", "saku", "child", "noun"],
      ["keso", "keso", "ask", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ta", "-ta", "2sg", "person"],
      ["vi", "vi", "yes-no question", "particle"]
    ]
  ),
  passage(
    "poku-mi-na",
    "I answer.",
    ["speech", "first-person"],
    [
      ["poku", "poku", "answer", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-na", "-na", "1sg", "person"]
    ]
  ),
  passage(
    "nala-ke veka sepa-mi-mu",
    "We wait because of rain.",
    ["causal", "rain"],
    [
      ["nala", "nala", "rain", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["veka", "veka", "because", "causal-linker"],
      ["sepa", "sepa", "wait", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  ),
  passage(
    "mara nema-mi-ki",
    "Mother knows.",
    ["knowledge", "kinship"],
    [
      ["mara", "mara", "mother", "noun"],
      ["nema", "nema", "know", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "vane-ke lira-mi-nu-ki",
    "In the evening, she usually sings.",
    ["habitual", "evening", "music"],
    [
      ["vane", "vane", "evening", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["lira", "lira", "sing", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-nu", "-nu", "habitual", "aspect"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "keso-ko tiru",
    "Asking is good.",
    ["nominalization", "speech"],
    [
      ["keso", "keso", "ask", "verb-root"],
      ["-ko", "-ko", "nominalizer", "derivation"],
      ["tiru", "tiru", "good", "adjective"]
    ]
  ),
  passage(
    "fira raki-lo-mu",
    "We ate fish.",
    ["food", "past"],
    [
      ["fira", "fira", "fish", "noun"],
      ["raki", "raki", "eat", "verb-root"],
      ["-lo", "-lo", "past", "tense"],
      ["-mu", "-mu", "1pl", "person"]
    ]
  )
];
