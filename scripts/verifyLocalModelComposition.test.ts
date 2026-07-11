import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { EXPANSION_PASSAGES } from "./verifyLocalModelFixturesCore.mjs";
import { buildExerciseDefs } from "./verifyLocalModelFixturesExpansion.mjs";
import { sameModel, visibleAssistantContent } from "./verifyLocalModelSetup.mjs";

const MODULES = [
  "verifyLocalModelRuntime.mjs",
  "verifyLocalModelFixturesCore.mjs",
  "verifyLocalModelFixturesExpansion.mjs",
  "verifyLocalModelSetup.mjs",
  "verifyLocalModelLiveChecks.mjs",
  "verifyLocalModelWorkflows.mjs",
  "verifyLocalModelReporting.mjs"
] as const;

describe("local-model verifier composition", () => {
  it("keeps synthetic fixtures and pure model helpers intact", () => {
    expect(EXPANSION_PASSAGES.length).toBeGreaterThan(10);
    expect(EXPANSION_PASSAGES.every((item) => item.consentStatus.use === "community-approved")).toBe(true);
    expect(buildExerciseDefs(["rule-present"])).toHaveLength(6);
    expect(sameModel(" Irene ", "irene")).toBe(true);
    expect(
      visibleAssistantContent({
        choices: [{ message: { content: [{ type: "text", text: " ok " }] } }]
      })
    ).toBe("ok");
  });

  it("keeps every production module bounded without importing the CLI entry", async () => {
    for (const moduleName of MODULES) {
      const source = await readFile(new URL(moduleName, import.meta.url), "utf8");
      expect(source.split(/\r?\n/).length, moduleName).toBeLessThanOrEqual(800);
      expect(source).not.toMatch(/from\s+["']\.\/verifyLocalModelLanguage\.mjs["']/);
    }
  });

  it("preserves the acceptance sequence and terminal summary in the thin CLI", async () => {
    const source = await readFile(new URL("verifyLocalModelLanguage.mjs", import.meta.url), "utf8");
    const orderedCalls = [
      "configurePreferredModel()",
      "ensureLanguage()",
      "importExpansionCorpus(language.id)",
      "processModelSource(language.id)",
      "runLiveModelChecks(language.id)",
      "runPracticeAndEvaluation(language.id)",
      "runElderCorrectionWorkflow(language.id)",
      "runReviewDispositionWorkflow(language.id)",
      "assertPublicExports(language.id)",
      "summaryAndExit()"
    ];
    let cursor = -1;
    for (const call of orderedCalls) {
      const next = source.indexOf(call, cursor + 1);
      expect(next, `${call} should remain in CLI order`).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(source).toContain("main().catch");
    expect(source).toContain('fail("Verifier crashed"');
  });
});
