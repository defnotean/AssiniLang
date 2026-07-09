import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import {
  toPublicEvaluationArtifact,
  toPublicLanguageSnapshot
} from "../apps/api/src/publicLanguageViews.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPORTED_AT = "2026-06-06T00:00:00.000Z";
const SHA_256_HEX = /^[a-f0-9]{64}$/;
const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
];

const FORBIDDEN_STRINGS = [
  "expectedAnswers",
  "gradingExplanation",
  "adversarialAnswers",
  "apiKey",
  "private learner answer",
  "private grading explanation",
  "test-generator",
  "answer key"
] as const;

const FORBIDDEN_PATTERNS = [/ASSINI_[A-Z0-9_]*_API_KEY/i] as const;

type AccountabilityExport = {
  exportVersion?: string;
  integrity?: {
    algorithm: string;
    contentHash: string;
    generatedBy: string;
    redactionPolicy: string[];
  };
};

function assertRedacted(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  for (const forbidden of FORBIDDEN_STRINGS) {
    expect(serialized).not.toContain(forbidden);
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(serialized).not.toMatch(pattern);
  }
  expect(serialized).not.toMatch(/"learnerId"\s*:/);
  expect(serialized).not.toMatch(/"answer"\s*:/);
}

function assertIntegrity(artifact: AccountabilityExport): void {
  expect(artifact.exportVersion).toBeTruthy();
  expect(artifact.integrity).toMatchObject({
    algorithm: "sha256",
    generatedBy: "assini-local-export-v1",
    redactionPolicy: EXPORT_REDACTION_POLICY
  });
  expect(artifact.integrity?.contentHash).toMatch(SHA_256_HEX);
}

function buildAccountabilityWorkspace() {
  const state = buildTestWorkspaceState();
  state.evaluationRuns = [
    {
      id: "eval-testlang-latest",
      languageId: TEST_LANGUAGE_ID,
      createdAt: "2026-06-06T00:00:00.000Z",
      systemVersion: "deterministic-study-loop-v1",
      fixtureVersion: "workspace-corpus-v1",
      scores: { noteAccuracy: 1, corpusCoverage: 0.75 },
      failures: [
        {
          category: "corpusCoverage",
          languageId: TEST_LANGUAGE_ID,
          itemId: "testlang-c999",
          message: "Missing passage coverage."
        }
      ],
      summary: "Testlang: 87.5% average score across 2 categories."
    }
  ];
  state.exerciseSubmissions = [
    {
      id: "private-submission",
      exerciseId: "testlang-ex-001",
      languageId: TEST_LANGUAGE_ID,
      answer: "private learner answer",
      accepted: false,
      explanation: "private grading explanation",
      submittedAt: "2026-06-06T00:00:00.000Z",
      learnerId: "learner-1"
    }
  ];
  return state;
}

async function readGoldenSample(filename: string): Promise<unknown> {
  const path = join(projectRoot, "fixtures/exports", filename);
  return JSON.parse(await readFile(path, "utf8"));
}

describe("review accountability golden exports", () => {
  it("keeps the language snapshot golden sample redacted and signed", async () => {
    const sample = await readGoldenSample("language-snapshot.sample.json");

    assertRedacted(sample);
    assertIntegrity(sample as AccountabilityExport);
    expect((sample as { exportVersion: string }).exportVersion).toBe("language-snapshot-v2");
    expect((sample as { exportedAt: string }).exportedAt).toBe(EXPORTED_AT);
  });

  it("keeps the evaluation artifact golden sample redacted and signed", async () => {
    const sample = await readGoldenSample("evaluation-artifact.sample.json");

    assertRedacted(sample);
    assertIntegrity(sample as AccountabilityExport);
    expect((sample as { exportVersion: string }).exportVersion).toBe("evaluation-artifact-v2");
    expect((sample as { exportedAt: string }).exportedAt).toBe(EXPORTED_AT);
  });

  it("builds live language snapshots with the same redaction guarantees", () => {
    const state = buildAccountabilityWorkspace();
    const snapshot = toPublicLanguageSnapshot(state, TEST_LANGUAGE_ID, EXPORTED_AT);

    assertRedacted(snapshot);
    assertIntegrity(snapshot as AccountabilityExport);
    expect(snapshot?.exportVersion).toBe("language-snapshot-v2");
    expect(snapshot?.exercises[0]).not.toHaveProperty("expectedAnswers");
    expect(snapshot?.exercises[0]).not.toHaveProperty("gradingExplanation");
  });

  it("builds live evaluation artifacts with the same redaction guarantees", () => {
    const state = buildAccountabilityWorkspace();
    const artifact = toPublicEvaluationArtifact(state, EXPORTED_AT);

    assertRedacted(artifact);
    assertIntegrity(artifact as AccountabilityExport);
    expect(artifact.exportVersion).toBe("evaluation-artifact-v2");
    expect(artifact).not.toHaveProperty("exerciseSubmissions");
    expect(artifact).not.toHaveProperty("noteAnswerKeys");
    expect(artifact).not.toHaveProperty("aiSessions");
  });

  it("matches golden samples when built from the accountability fixture workspace", async () => {
    const state = buildAccountabilityWorkspace();
    const liveSnapshot = toPublicLanguageSnapshot(state, TEST_LANGUAGE_ID, EXPORTED_AT);
    const liveArtifact = toPublicEvaluationArtifact(state, EXPORTED_AT);
    const goldenSnapshot = await readGoldenSample("language-snapshot.sample.json");
    const goldenArtifact = await readGoldenSample("evaluation-artifact.sample.json");

    expect(liveSnapshot).toEqual(goldenSnapshot);
    expect(liveArtifact).toEqual(goldenArtifact);
  });
});
