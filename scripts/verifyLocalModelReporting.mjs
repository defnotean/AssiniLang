import { ok, fail, api, GOVERNANCE_POLICY_CONTENT } from "./verifyLocalModelRuntime.mjs";

export async function assertObservabilityAndNeuralMap(languageId) {
  const sessions = await api("GET", "/observability/ai-sessions", undefined, "programmer-1");
  if (
    sessions.status === 200 &&
    sessions.json?.totals?.sessions > 0 &&
    sessions.json?.totals?.messages > 0 &&
    sessions.json?.totals?.elderCorrections > 0
  ) {
    ok(
      "AI observability",
      `${sessions.json.totals.sessions} sessions, ${sessions.json.totals.elderCorrections} elder corrections`
    );
  } else {
    fail("AI observability", `${sessions.status} ${String(sessions.text).slice(0, 300)}`);
  }

  const metrics = await api("GET", "/observability/metrics", undefined, "programmer-1");
  if (metrics.status === 200 && metrics.json?.storage?.ok === true && metrics.json?.requests?.total > 0) {
    ok(
      "System observability",
      `${metrics.json.requests.total} requests, queue ${metrics.json.jobQueue?.pending ?? "?"}/${metrics.json.jobQueue?.active ?? "?"}`
    );
  } else {
    fail("System observability", `${metrics.status} ${String(metrics.text).slice(0, 300)}`);
  }

  const neuralMap = await api(
    "GET",
    `/observability/neural-map?languageId=${encodeURIComponent(languageId)}`,
    undefined,
    "programmer-1"
  );
  const nodeTypes = new Set((neuralMap.json?.nodes ?? []).map((node) => node.type));
  const edgeRelations = new Set((neuralMap.json?.edges ?? []).map((edge) => edge.relation));
  const requiredNodeTypes = ["language", "corpus", "note", "exercise", "ai_session", "elder_correction"];
  const missingNodeTypes = requiredNodeTypes.filter((type) => !nodeTypes.has(type));
  const requiredEdgeRelations = ["has_corpus", "has_note", "has_exercise", "generated", "proposed_correction"];
  const missingEdgeRelations = requiredEdgeRelations.filter((relation) => !edgeRelations.has(relation));

  if (neuralMap.status === 200 && missingNodeTypes.length === 0 && missingEdgeRelations.length === 0) {
    ok("Neural map observability", `${neuralMap.json.nodes.length} nodes, ${neuralMap.json.edges.length} edges`);
  } else {
    fail(
      "Neural map observability",
      `${neuralMap.status}; missing nodes=${missingNodeTypes.join(",") || "none"}; missing edges=${missingEdgeRelations.join(",") || "none"}`
    );
  }
}

export async function assertProfileCoverage(languageId) {
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

export async function assertProfileStructure(languageId) {
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
      return (
        !entry ||
        entry.occurrenceCount < 1 ||
        !Array.isArray(entry.glosses) ||
        !entry.glosses.some((item) => String(item).toLowerCase().includes(gloss)) ||
        !entry.vocabulary
      );
    })
    .map(([surface]) => surface);

  const exerciseTypes = profile.json?.stats?.exerciseTypes ?? {};
  const missingExerciseTypes = ["translate_to_target", "translate_to_english", "segment", "choose_particle"].filter(
    (type) => Number(exerciseTypes[type] ?? 0) <= 0
  );

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
    ok(
      "Profile structure",
      `${requiredMorphemes.length} morphemes linked, ${Object.keys(exerciseTypes).length} exercise types, ${paradigmGaps.length} normalized gaps`
    );
  }
}

export function hasValidContentHash(exportObject) {
  return /^[a-f0-9]{64}$/.test(String(exportObject?.integrity?.contentHash ?? ""));
}

export function jsonHasField(serializedJson, field) {
  return new RegExp(`"${field}"\\s*:`).test(serializedJson);
}

export async function assertPublicExports(languageId) {
  const snapshot = await api("GET", `/exports/languages/${languageId}/snapshot`, undefined, "reviewer-1");
  if (snapshot.status !== 200) {
    fail("Language snapshot export", `${snapshot.status} ${String(snapshot.text).slice(0, 300)}`);
  } else {
    const stats = snapshot.json?.linguisticProfile?.stats ?? {};
    const snapshotText = JSON.stringify(snapshot.json);
    const protectedFields = ["expectedAnswers", "adversarialAnswers", "gradingExplanation", "learnerId", "answer"];
    const leakedFields = protectedFields.filter((field) => jsonHasField(snapshotText, field));
    const hasGovernancePolicy =
      Array.isArray(snapshot.json?.governance) &&
      snapshot.json.governance.some((record) => record.content === GOVERNANCE_POLICY_CONTENT);
    if (
      snapshot.json?.exportVersion === "language-snapshot-v2" &&
      hasValidContentHash(snapshot.json) &&
      stats.vocabularyItems >= 94 &&
      stats.corpusPassages >= 56 &&
      Array.isArray(snapshot.json?.exercises) &&
      snapshot.json.exercises.length >= 33 &&
      leakedFields.length === 0 &&
      hasGovernancePolicy
    ) {
      ok(
        "Language snapshot export",
        `${stats.vocabularyItems} vocab, ${stats.corpusPassages} corpus, ${snapshot.json.exercises.length} public exercises`
      );
    } else {
      fail(
        "Language snapshot export",
        `invalid snapshot contract; leaked=${leakedFields.join(",") || "none"} governance=${hasGovernancePolicy} stats=${JSON.stringify(stats).slice(0, 160)}`
      );
    }
  }

  const artifact = await api("GET", "/exports/evaluations/artifact", undefined, "reviewer-1");
  if (artifact.status !== 200) {
    fail("Evaluation artifact export", `${artifact.status} ${String(artifact.text).slice(0, 300)}`);
    return;
  }

  const latestRuns = Array.isArray(artifact.json?.latestRuns) ? artifact.json.latestRuns : [];
  if (
    artifact.json?.exportVersion === "evaluation-artifact-v2" &&
    hasValidContentHash(artifact.json) &&
    artifact.json?.summary?.totalRuns > 0 &&
    latestRuns.some((run) => run.languageId === languageId)
  ) {
    ok("Evaluation artifact export", `${artifact.json.summary.totalRuns} total runs, latest includes ${languageId}`);
  } else {
    fail("Evaluation artifact export", `invalid artifact contract ${String(artifact.text).slice(0, 300)}`);
  }
}
