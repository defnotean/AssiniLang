import { passage } from "./verifyLocalModelFixturesCore.mjs";

export const COMMAND_PASSAGES = [
  passage(
    "meka pavo-ro",
    "Open the door.",
    ["command", "door"],
    [
      ["meka", "meka", "door", "noun"],
      ["pavo", "pavo", "open", "verb-root"],
      ["-ro", "-ro", "imperative", "mood"]
    ]
  ),
  passage(
    "falu moku-ro",
    "Listen to the drum.",
    ["command", "music"],
    [
      ["falu", "falu", "drum", "noun"],
      ["moku", "moku", "listen", "verb-root"],
      ["-ro", "-ro", "imperative", "mood"]
    ]
  ),
  passage(
    "ruma-ke ravo-mi-ki-ne",
    "They say she returns home.",
    ["reported", "home", "evidential"],
    [
      ["ruma", "ruma", "home", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["ravo", "ravo", "return", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["-ne", "-ne", "reported-evidential", "evidential"]
    ]
  ),
  passage(
    "veno kora-mi-ki-ne",
    "They say she speaks the message.",
    ["reported", "speech", "message"],
    [
      ["veno", "veno", "message", "noun"],
      ["kora", "kora", "speak", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["-ne", "-ne", "reported-evidential", "evidential"]
    ]
  ),
  passage(
    "lome-ve meka pavo-mi-ta",
    "You open the door by hand.",
    ["tool", "door", "second-person"],
    [
      ["lome", "lome", "hand", "noun"],
      ["-ve", "-ve", "comitative", "case"],
      ["meka", "meka", "door", "noun"],
      ["pavo", "pavo", "open", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ta", "-ta", "2sg", "person"]
    ]
  ),
  passage(
    "veno siva-ro",
    "Send the message.",
    ["command", "message"],
    [
      ["veno", "veno", "message", "noun"],
      ["siva", "siva", "send", "verb-root"],
      ["-ro", "-ro", "imperative", "mood"]
    ]
  )
];

export const RELATIONAL_PASSAGES = [
  passage(
    "tara kemu-sa vori-mi-ki",
    "Father protects his basket.",
    ["possession", "family", "protection"],
    [
      ["tara", "tara", "father", "noun"],
      ["kemu", "kemu", "basket", "noun"],
      ["-sa", "-sa", "possessed", "possession"],
      ["vori", "vori", "protect", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "niru liru-sa lira-mi-ki",
    "The friend sings their song.",
    ["possession", "music", "friendship"],
    [
      ["niru", "niru", "friend", "noun"],
      ["liru", "liru", "song", "noun"],
      ["-sa", "-sa", "possessed", "possession"],
      ["lira", "lira", "sing", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "lumi ravi eka vaku",
    "The lamp is brighter than the fire.",
    ["comparison", "brightness"],
    [
      ["lumi", "lumi", "lamp", "noun"],
      ["ravi", "ravi", "bright", "adjective"],
      ["eka", "eka", "comparative-linker", "particle"],
      ["vaku", "vaku", "fire", "noun"]
    ]
  ),
  passage(
    "rano varu eka penu",
    "The canoe is stronger than the net.",
    ["comparison", "tools"],
    [
      ["rano", "rano", "canoe", "noun"],
      ["varu", "varu", "strong", "adjective"],
      ["eka", "eka", "comparative-linker", "particle"],
      ["penu", "penu", "net", "noun"]
    ]
  ),
  passage(
    "meka pavo-ro vo tara kora-mi-ki",
    'Father says, "Open the door."',
    ["quotation", "command", "speech"],
    [
      ["meka", "meka", "door", "noun"],
      ["pavo", "pavo", "open", "verb-root"],
      ["-ro", "-ro", "imperative", "mood"],
      ["vo", "vo", "quotative", "particle"],
      ["tara", "tara", "father", "noun"],
      ["kora", "kora", "speak", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "pesa tima-mi-na vo mara moku-mi-ki",
    "Mother hears me say that I gather bowls.",
    ["quotation", "gathering", "kinship"],
    [
      ["pesa", "pesa", "bowl", "noun"],
      ["tima", "tima", "gather", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-na", "-na", "1sg", "person"],
      ["vo", "vo", "quotative", "particle"],
      ["mara", "mara", "mother", "noun"],
      ["moku", "moku", "listen", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "saku lome-sa sora-mi-ki",
    "The child sees their hand.",
    ["possession", "perception"],
    [
      ["saku", "saku", "child", "noun"],
      ["lome", "lome", "hand", "noun"],
      ["-sa", "-sa", "possessed", "possession"],
      ["sora", "sora", "see", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "veno siva-mi-na vo niru nema-mi-ki",
    "The friend knows that I send the message.",
    ["quotation", "message", "knowledge"],
    [
      ["veno", "veno", "message", "noun"],
      ["siva", "siva", "send", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-na", "-na", "1sg", "person"],
      ["vo", "vo", "quotative", "particle"],
      ["niru", "niru", "friend", "noun"],
      ["nema", "nema", "know", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  )
];

export const UPLOADED_NOTEBOOK_PASSAGES = [
  passage(
    "tara ano mara kora-mi-ki",
    "Father and mother speak.",
    ["coordination", "family", "speech"],
    [
      ["tara", "tara", "father", "noun"],
      ["ano", "ano", "and", "linker"],
      ["mara", "mara", "mother", "noun"],
      ["kora", "kora", "speak", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "nala pira lumi ravi",
    "It rains, but the lamp is bright.",
    ["contrast", "weather", "brightness"],
    [
      ["nala", "nala", "rain", "noun"],
      ["pira", "pira", "but", "linker"],
      ["lumi", "lumi", "lamp", "noun"],
      ["ravi", "ravi", "bright", "adjective"]
    ]
  ),
  passage(
    "niru ravo-mi-ki-li saku lira-mi-ki",
    "After the friend returns, the child sings.",
    ["sequence", "return", "music"],
    [
      ["niru", "niru", "friend", "noun"],
      ["ravo", "ravo", "return", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["-li", "-li", "sequential", "clause-suffix"],
      ["saku", "saku", "child", "noun"],
      ["lira", "lira", "sing", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "niru ravo-mi-ki-li liru lira-mi-ki",
    "After the friend returns, she sings the song.",
    ["sequence", "return", "music"],
    [
      ["niru", "niru", "friend", "noun"],
      ["ravo", "ravo", "return", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"],
      ["-li", "-li", "sequential", "clause-suffix"],
      ["liru", "liru", "song", "noun"],
      ["lira", "lira", "sing", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  ),
  passage(
    "ratu-ke mipa kulu talo-mi-nu-ki",
    "The small group usually walks on the road.",
    ["road", "habitual", "group"],
    [
      ["ratu", "ratu", "road", "noun"],
      ["-ke", "-ke", "locative", "case"],
      ["mipa", "mipa", "group", "noun"],
      ["kulu", "kulu", "small", "adjective"],
      ["talo", "talo", "walk", "verb-root"],
      ["-mi", "-mi", "present", "tense"],
      ["-nu", "-nu", "habitual", "aspect"],
      ["-ki", "-ki", "3sg", "person"]
    ]
  )
];

export function buildExerciseDefs(ruleIds) {
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

export function buildAdvancedExerciseDefs(ruleIds) {
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
      gradingExplanation:
        "The garden is marked with -ke, saku takes plural -pa, and sepa-mi-se-ki marks wait-PRES-PROG-3SG."
    },
    {
      type: "translate_to_english",
      prompt: "Translate into English: tara-ri niru-ve kora-mi-se-ki",
      allowedVocabulary: ["tara", "-ri", "niru", "-ve", "kora", "-mi", "-se", "-ki"],
      allowedRuleIds: threeRules,
      expectedAnswers: ["Honored father is speaking with the friend."],
      adversarialAnswers: [
        { answer: "Father spoke with the friend.", reason: "-mi marks present and -se marks progressive, not past." },
        {
          answer: "The friend is speaking with father.",
          reason: "tara-ri is the respected speaker; niru-ve is the with-phrase."
        }
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

export function buildDiscourseExerciseDefs(ruleIds) {
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
        {
          answer: "lenu-ke fira penu-ke tima-mi-nu-mu",
          reason: "-ke marks location; the tool phrase needs comitative -ve."
        }
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
        {
          answer: "The friend walked and returned.",
          reason: "-la marks a conditional clause and -fu marks future return."
        },
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
      gradingExplanation:
        "talo is walk, -mi is present, -ki is third singular, and -la marks the completed clause as conditional."
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

export function buildCommandExerciseDefs(ruleIds) {
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

export function buildRelationalExerciseDefs(ruleIds) {
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
        {
          answer: "The fire is brighter than the lamp.",
          reason: "The standard follows eka, so vaku is the comparison standard."
        },
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
      prompt: 'Translate into Veridspark: Father says, "Open the door."',
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

export function buildUploadedNotebookExerciseDefs(ruleIds) {
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
        {
          answer: "The friend sings after the child returns.",
          reason: "The first clause is niru ravo-mi-ki-li; the second is saku lira-mi-ki."
        },
        {
          answer: "The friend returned and the child sang.",
          reason: "-mi is present and -li marks sequence, not past."
        }
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
