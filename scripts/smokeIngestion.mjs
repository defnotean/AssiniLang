import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBootstrapState } from "@assini/db";
import { createServer } from "../apps/api/src/server.ts";

const app = createServer({
  initialState: createBootstrapState(),
  rateLimit: false,
  authToken: "smoke-token",
  dataDir: mkdtempSync(join(tmpdir(), "assini-smoke-"))
});

const auth = { "x-assini-user-id": "reviewer-1", "x-assini-dev-token": "smoke-token" };

function expectStatus(label, response, expected) {
  if (response.statusCode !== expected) {
    console.error(`${label}: expected ${expected}, got ${response.statusCode}: ${response.body}`);
    process.exit(1);
  }
  console.log(`${label}: ${response.statusCode} OK`);
}

function expectReady(label, response) {
  expectStatus(label, response, 200);
  const body = response.json();
  if (body.ok !== true) {
    console.error(`${label}: expected ok=true, got: ${response.body}`);
    process.exit(1);
  }
  if (!body.checks?.storage?.ok) {
    console.error(`${label}: expected checks.storage.ok, got: ${response.body}`);
    process.exit(1);
  }
  if (!body.checks?.jobQueue?.ok) {
    console.error(`${label}: expected checks.jobQueue.ok, got: ${response.body}`);
    process.exit(1);
  }
  if (typeof body.checks.jobQueue.pending !== "number" || typeof body.checks.jobQueue.active !== "number") {
    console.error(`${label}: expected numeric jobQueue pending/active, got: ${response.body}`);
    process.exit(1);
  }
  console.log(`  ready checks: storage ok, jobQueue pending=${body.checks.jobQueue.pending} active=${body.checks.jobQueue.active}`);
}

// 0. Readiness probe (same storage + jobQueue shape CI asserts on built-dist /ready)
const ready = await app.inject({ method: "GET", url: "/ready" });
expectReady("ready", ready);

// 1. Create a language
const createLanguage = await app.inject({
  method: "POST",
  url: "/languages",
  headers: auth,
  payload: {
    name: "Riverspeak",
    description: "A community language documented from field notes.",
    orthography: "Lowercase Latin with hyphenated suffixes.",
    typology: "agglutinative"
  }
});
expectStatus("create language", createLanguage, 201);
const language = createLanguage.json();
console.log("  language id:", language.id, "status:", language.status);

// 2. Register a pasted word-list source
const registerSource = await app.inject({
  method: "POST",
  url: `/languages/${language.id}/sources`,
  headers: auth,
  payload: {
    kind: "wordlist",
    title: "Field notebook page 1",
    rawText: "mira = river\nsaku = child\nmira talo-na = I walk by the river"
  }
});
expectStatus("register source", registerSource, 201);
const source = registerSource.json();

// 3. Process it (deterministic provider -> offline heuristics)
const processSource = await app.inject({
  method: "POST",
  url: `/sources/${source.id}/process`,
  headers: auth
});
expectStatus("process source", processSource, 200);
const processed = processSource.json();
console.log("  drafts:", processed.drafts.length, "warnings:", processed.warnings);
if (processed.drafts.length < 3) {
  console.error("expected at least 3 drafts");
  process.exit(1);
}

// 4. Accept one lexeme draft and one corpus draft
const lexemeDraft = processed.drafts.find((draft) => draft.kind === "lexeme");
const corpusDraft = processed.drafts.find((draft) => draft.kind === "corpus_passage");

const acceptLexeme = await app.inject({
  method: "POST",
  url: `/extraction-drafts/${lexemeDraft.id}/accept`,
  headers: auth
});
expectStatus("accept lexeme draft", acceptLexeme, 200);

const acceptCorpus = await app.inject({
  method: "POST",
  url: `/extraction-drafts/${corpusDraft.id}/accept`,
  headers: auth
});
expectStatus("accept corpus draft", acceptCorpus, 200);
console.log("  corpus entity:", JSON.stringify(acceptCorpus.json().entity.morphologicalSegmentation));

// 5. Reject the remaining draft
const remaining = processed.drafts.find((draft) => draft.id !== lexemeDraft.id && draft.id !== corpusDraft.id);
const reject = await app.inject({
  method: "POST",
  url: `/extraction-drafts/${remaining.id}/reject`,
  headers: auth
});
expectStatus("reject draft", reject, 200);

// 6. Profile reflects the committed data
const profile = await app.inject({ method: "GET", url: `/languages/${language.id}/profile` });
expectStatus("profile", profile, 200);
const profileBody = profile.json();
console.log("  profile stats:", JSON.stringify(profileBody.stats));

// 7. Lexicon endpoint
const lexicon = await app.inject({ method: "GET", url: `/languages/${language.id}/lexicon` });
expectStatus("lexicon", lexicon, 200);
console.log("  lexicon entries:", lexicon.json().length);

// 8. Role gate: learner cannot create languages
const forbidden = await app.inject({
  method: "POST",
  url: "/languages",
  headers: { "x-assini-user-id": "learner-1", "x-assini-dev-token": "smoke-token" },
  payload: { name: "Nope", description: "x", orthography: "y" }
});
expectStatus("learner forbidden", forbidden, 403);

// 9. URL source with stubbed fetch is exercised via ingestionFetch in tests; here check audio fails helpfully
const audioRegister = await app.inject({
  method: "POST",
  url: `/languages/${language.id}/sources`,
  headers: auth,
  payload: { kind: "text", title: "empty-check", rawText: "   " }
});
expectStatus("blank text rejected", audioRegister, 400);

await app.close();
console.log("SMOKE TEST PASSED");
