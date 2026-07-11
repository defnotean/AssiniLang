import {
  API,
  ok,
  fail,
  summaryAndExit,
  directJson,
  ADVANCED_SOURCE_TITLE,
  DISCOURSE_SOURCE_TITLE,
  COMMAND_SOURCE_TITLE,
  RELATIONAL_SOURCE_TITLE
} from "./verifyLocalModelRuntime.mjs";
import {
  ADVANCED_MODEL_SOURCE_TEXT,
  DISCOURSE_MODEL_SOURCE_TEXT,
  COMMAND_MODEL_SOURCE_TEXT,
  RELATIONAL_MODEL_SOURCE_TEXT
} from "./verifyLocalModelFixturesCore.mjs";
import {
  configurePreferredModel,
  ensureLanguage,
  importExpansionCorpus,
  importAdvancedCorpus,
  importDiscourseCorpus,
  importCommandCorpus,
  importRelationalCorpus,
  importUploadedNotebookCorpus,
  processModelSource,
  processUploadedNotebookSource,
  ensureDiscourseGrounding,
  ensureCommandGrounding
} from "./verifyLocalModelSetup.mjs";
import {
  approveNotes,
  modelDraftNotes,
  authorExercises,
  assertRelationalExpansion,
  assertUploadedNotebookExpansion,
  runLiveModelChecks
} from "./verifyLocalModelLiveChecks.mjs";
import {
  runPracticeAndEvaluation,
  ensureGovernanceRecord,
  runElderCorrectionWorkflow,
  runReviewDispositionWorkflow
} from "./verifyLocalModelWorkflows.mjs";
import {
  assertObservabilityAndNeuralMap,
  assertProfileCoverage,
  assertProfileStructure,
  assertPublicExports
} from "./verifyLocalModelReporting.mjs";

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
  fail("Verifier crashed", error instanceof Error ? (error.stack ?? error.message) : String(error));
  summaryAndExit();
});
