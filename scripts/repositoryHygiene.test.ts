import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(projectRoot, path), "utf8");
}

describe("repository production hygiene", () => {
  it("points runtime package entrypoints at built JavaScript", async () => {
    const apiPackage = JSON.parse(await readProjectFile("apps/api/package.json"));
    const dbPackage = JSON.parse(await readProjectFile("packages/db/package.json"));
    const evalPackage = JSON.parse(await readProjectFile("packages/eval/package.json"));

    expect(apiPackage.main).toBe("dist/index.js");
    expect(apiPackage.scripts.start).toBe("node dist/index.js");
    expect(apiPackage.scripts.start).not.toContain("tsx");
    expect(dbPackage.main).toBe("dist/index.js");
    expect(evalPackage.main).toBe("dist/index.js");
  });

  it("documents the local CI green smoke helper for production audits", async () => {
    const script = await readProjectFile("scripts/ciGreenSmoke.mjs");
    const developmentDocs = await readProjectFile("docs/development.md");

    expect(script).toContain(".github/workflows/ci.yml");
    expect(script).toContain("npm audit");
    expect(script).toContain("--omit=dev");
    expect(script).toContain("failed to start");
    expect(script).toContain("terminated by signal");
    expect(script).toContain("production dependency audit passed");
    expect(developmentDocs).toContain("npm.cmd run ci:green");
    expect(developmentDocs).toContain("--omit=dev");
  });

  it("wires the local CI green smoke helper in package.json scripts", async () => {
    const pkg = JSON.parse(await readProjectFile("package.json"));

    expect(pkg.scripts["ci:green"]).toBe("node scripts/ciGreenSmoke.mjs");
    expect(pkg.scripts["verify:beta"]).toBe("node scripts/verifyBetaCli.mjs");
    expect(pkg.scripts["smoke"]).toBe("tsx scripts/smokeIngestion.mjs");
    expect(pkg.scripts["smoke:backup"]).toBe("tsx scripts/smokeBackupRestore.mjs");
  });

  it("documents the optional verify:beta live-model gate", async () => {
    const pkg = JSON.parse(await readProjectFile("package.json"));
    const verifyBeta = await readProjectFile("scripts/verifyBeta.mjs");
    const verifyBetaCli = await readProjectFile("scripts/verifyBetaCli.mjs");
    const developmentDocs = await readProjectFile("docs/development.md");
    const readme = await readProjectFile("README.md");
    const configuration = await readProjectFile("docs/configuration.md");

    expect(pkg.scripts["model:verify"]).toBe("node scripts/verifyLocalModelLanguage.mjs");
    expect(verifyBetaCli).toContain("runVerifyBeta");
    expect(verifyBetaCli).toContain("pathToFileURL");
    expect(verifyBetaCli).toContain("isMain");
    expect(verifyBeta).toContain("modelVerifyRequested");
    expect(verifyBeta).toContain("ASSINI_VERIFY_MODEL");
    expect(verifyBeta).toContain("skipping model:verify");
    expect(verifyBeta).toContain("preferred model:");
    expect(verifyBeta).toContain("terminated by signal");
    expect(developmentDocs).toContain("npm.cmd run verify:beta");
    expect(developmentDocs).toContain('ASSINI_VERIFY_MODEL="1"');
    expect(readme).toContain("npm.cmd run verify:beta");
    expect(readme).toContain("npm.cmd run ci:green");
    expect(configuration).toContain("ASSINI_VERIFY_MODEL");
    expect(configuration).toContain("ASSINI_VERIFY_MODEL_NAME");
  });

  it("documents the backup/restore smoke gate for CI", async () => {
    const script = await readProjectFile("scripts/smokeBackupRestore.mjs");
    const ingestionSmoke = await readProjectFile("scripts/smokeIngestion.mjs");
    const developmentDocs = await readProjectFile("docs/development.md");
    const ciGreen = await readProjectFile("scripts/ciGreenSmoke.mjs");

    expect(script).toContain("backupTo");
    expect(script).toContain("restoreFrom");
    expect(script).toContain("runBackupCli");
    expect(script).toContain("--force");
    expect(script).toContain("force: true");
    expect(script).toContain("--dry-run");
    expect(script).toContain("dryRun");
    expect(script).toContain("CLI --dry-run valid workspace: no write");
    expect(script).toContain("timed backup/restore drill log");
    expect(script).toContain("timed-backup-restore");
    expect(script).toContain("softBoundMs");
    expect(ingestionSmoke).toContain('url: "/ready"');
    expect(ingestionSmoke).toContain("checks?.storage?.ok");
    expect(ingestionSmoke).toContain("checks?.jobQueue?.ok");
    expect(developmentDocs).toContain("npm.cmd run smoke:backup");
    expect(developmentDocs).toContain("timed backup/restore drill log");
    expect(ciGreen).toContain("npm run smoke:backup");
  });

  it("runs the production readiness gate in GitHub Actions", async () => {
    const workflow = await readProjectFile(".github/workflows/ci.yml");

    expect(workflow).toContain("name: CI");
    expect(workflow).toContain("actions/checkout@v4");
    expect(workflow).toContain("actions/setup-node@v4");
    expect(workflow).toContain("node-version: 24.x");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run verify");
    expect(workflow).toContain("npm run smoke");
    expect(workflow).toContain("npm run smoke:backup");
    expect(workflow).toContain("Built-dist startup smoke (/health + /ready)");
    expect(workflow).toContain("body.checks?.storage?.ok");
    expect(workflow).toContain("body.checks?.jobQueue?.ok");
    expect(workflow).toContain("npm audit --audit-level=moderate");
    // Live-model verify stays opt-in; default CI must not require a reachable model.
    expect(workflow).not.toContain("npm run verify:beta");
    expect(workflow).not.toContain("ASSINI_VERIFY_MODEL");
  });

  it("keeps a non-secret environment template aligned with documented configuration", async () => {
    const example = await readProjectFile(".env.example");
    const configuration = await readProjectFile("docs/configuration.md");

    for (const variable of [
      "ASSINI_LLM_PROVIDER",
      "ASSINI_LLM_BASE_URL",
      "ASSINI_LLM_MODEL",
      "ASSINI_LLM_API_KEY",
      "ASSINI_LLM_TIMEOUT_MS",
      "ASSINI_LLM_MAX_TOKENS",
      "ASSINI_LLM_JSON_MODE",
      "ASSINI_LLM_DISCOVERY_BASE_URLS",
      "ASSINI_TRANSCRIBE_BASE_URL",
      "ASSINI_TRANSCRIBE_MODEL",
      "ASSINI_TRANSCRIBE_API_KEY",
      "ASSINI_OCR_BASE_URL",
      "ASSINI_OCR_MODEL",
      "ASSINI_OCR_API_KEY",
      "ASSINI_OCR_PDF_MAX_PAGES",
      "ASSINI_OCR_LANG",
      "ASSINI_ALLOW_PRIVATE_URLS",
      "ASSINI_OBSIDIAN_VAULT_ROOTS",
      "ASSINI_DEV_API_PORT",
      "ASSINI_DEV_WEB_PORT",
      "ASSINI_DB_PATH",
      "ASSINI_ENABLE_PROTOTYPE_AUTH",
      "ASSINI_PROTOTYPE_SESSION_TTL_MS",
      "ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS",
      "ASSINI_COOKIE_SECURE",
      "ASSINI_DEV_AUTH_TOKEN",
      "ASSINI_ALLOWED_ORIGINS",
      "ASSINI_BODY_LIMIT_BYTES",
      "ASSINI_API_LOGGER",
      "ASSINI_VERIFY_MODEL",
      "ASSINI_VERIFY_MODEL_NAME"
    ]) {
      expect(example, `.env.example should include ${variable}`).toContain(variable);
    }

    // Documented default is 180000 ms; the example must not advertise a shorter stale value.
    expect(configuration).toMatch(/`ASSINI_LLM_TIMEOUT_MS`\s*\|\s*`180000`/);
    expect(example).toMatch(/ASSINI_LLM_TIMEOUT_MS=180000\b/);
    expect(example).not.toMatch(/ASSINI_LLM_TIMEOUT_MS=30000\b/);

    // Driver scripts default x-assini-dev-token to dev-local; the template must match.
    expect(example).toMatch(/^ASSINI_DEV_AUTH_TOKEN=dev-local$/m);
    expect(configuration).toMatch(/ASSINI_DEV_AUTH_TOKEN[\s\S]*dev-local/);

    // verify:beta stays opt-in; the template must document the gate without enabling it.
    expect(example).toMatch(/#\s*ASSINI_VERIFY_MODEL=1\b/);
    expect(example).toMatch(/#\s*ASSINI_VERIFY_MODEL_NAME=Irene\b/);
    expect(example).not.toMatch(/^ASSINI_VERIFY_MODEL=/m);

    expect(example).not.toMatch(/\bsk-[A-Za-z0-9._-]+/);
    expect(example).not.toMatch(/Bearer\s+\S+/i);
    expect(example).not.toMatch(/OPENAI_API_KEY=.*[A-Za-z0-9]{12,}/);
  });
});
