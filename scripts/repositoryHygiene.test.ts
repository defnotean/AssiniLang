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

    expect(script).toContain(".github/workflows/ci.yml");
    expect(script).toContain("npm audit");
    expect(script).toContain("--omit=dev");
  });

  it("wires the local CI green smoke helper in package.json scripts", async () => {
    const pkg = JSON.parse(await readProjectFile("package.json"));

    expect(pkg.scripts["ci:green"]).toBe("node scripts/ciGreenSmoke.mjs");
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
    expect(workflow).toContain("npm audit --audit-level=moderate");
  });

  it("keeps a non-secret environment template aligned with documented configuration", async () => {
    const example = await readProjectFile(".env.example");

    for (const variable of [
      "ASSINI_LLM_PROVIDER",
      "ASSINI_LLM_BASE_URL",
      "ASSINI_LLM_MODEL",
      "ASSINI_LLM_API_KEY",
      "ASSINI_TRANSCRIBE_BASE_URL",
      "ASSINI_TRANSCRIBE_MODEL",
      "ASSINI_TRANSCRIBE_API_KEY",
      "ASSINI_OCR_BASE_URL",
      "ASSINI_OCR_MODEL",
      "ASSINI_OCR_API_KEY",
      "ASSINI_OCR_LANG",
      "ASSINI_ALLOW_PRIVATE_URLS",
      "ASSINI_OBSIDIAN_VAULT_ROOTS",
      "ASSINI_DEV_API_PORT",
      "ASSINI_DEV_WEB_PORT",
      "ASSINI_DB_PATH",
      "ASSINI_ENABLE_PROTOTYPE_AUTH",
      "ASSINI_PROTOTYPE_SESSION_TTL_MS",
      "ASSINI_COOKIE_SECURE",
      "ASSINI_DEV_AUTH_TOKEN",
      "ASSINI_ALLOWED_ORIGINS",
      "ASSINI_BODY_LIMIT_BYTES",
      "ASSINI_API_LOGGER"
    ]) {
      expect(example, `.env.example should include ${variable}`).toContain(variable);
    }

    expect(example).not.toMatch(/\bsk-[A-Za-z0-9._-]+/);
    expect(example).not.toMatch(/Bearer\s+\S+/i);
    expect(example).not.toMatch(/OPENAI_API_KEY=.*[A-Za-z0-9]{12,}/);
  });
});
