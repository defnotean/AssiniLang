import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { bootstrapRuntimeEnvironment } from "./runtimeEnvLoader.js";

describe("runtime env bootstrap", () => {
  it("applies shell > repo-root > cwd precedence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-env-bootstrap-"));
    const apiSrcDir = join(dir, "apps", "api", "src");
    await mkdir(apiSrcDir, { recursive: true });
    const cwdDir = join(dir, "cwd");
    await mkdir(cwdDir, { recursive: true });

    await writeFile(join(cwdDir, ".env"), [
      "ASSINI_LLM_PROVIDER=from-cwd",
      "ASSINI_LLM_BASE_URL=http://127.0.0.1:9999/v1"
    ].join("\n"), "utf8");
    await writeFile(join(dir, ".env"), [
      "ASSINI_LLM_PROVIDER=from-repo",
      "ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1"
    ].join("\n"), "utf8");

    const env: Record<string, string | undefined> = {
      ASSINI_LLM_MODEL: "shell-model"
    };

    bootstrapRuntimeEnvironment({
      cwd: cwdDir,
      env,
      moduleUrl: pathToFileURL(join(apiSrcDir, "index.ts")).href
    });

    expect(env.ASSINI_LLM_PROVIDER).toBe("from-repo");
    expect(env.ASSINI_LLM_MODEL).toBe("shell-model");
    expect(env.ASSINI_LLM_BASE_URL).toBe("http://127.0.0.1:11434/v1");
    expect(env.ASSINI_LLM_BASE_URL).not.toBe("http://127.0.0.1:9999/v1");
  });

  it("can use an explicit writable settings file instead of the repo root file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-env-bootstrap-"));
    const apiSrcDir = join(dir, "apps", "api", "src");
    await mkdir(apiSrcDir, { recursive: true });
    const userDataDir = join(dir, "user-data");
    await mkdir(userDataDir, { recursive: true });

    await writeFile(join(dir, ".env"), "ASSINI_LLM_PROVIDER=from-repo\n", "utf8");
    const settingsPath = join(userDataDir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=from-user-data\n", "utf8");

    const env: Record<string, string | undefined> = {};
    const returnedPath = bootstrapRuntimeEnvironment({
      cwd: userDataDir,
      env,
      moduleUrl: pathToFileURL(join(apiSrcDir, "index.ts")).href,
      settingsPath
    });

    expect(returnedPath).toBe(settingsPath);
    expect(env.ASSINI_LLM_PROVIDER).toBe("from-user-data");
  });
});
