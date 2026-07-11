import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadRuntimeEnvFile } from "./runtimeEnv.js";

describe("runtime env file loading", () => {
  it("fills missing and blank env values while preserving nonblank shell overrides", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-env-"));
    const path = join(dir, ".env");
    await writeFile(
      path,
      [
        "# local settings",
        "ASSINI_LLM_PROVIDER=openai-compatible",
        "ASSINI_LLM_BASE_URL=http://127.0.0.1:12345/v1",
        "ASSINI_LLM_MODEL=Irene",
        "ASSINI_LLM_MAX_TOKENS=4096"
      ].join("\n"),
      "utf8"
    );
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "",
      ASSINI_LLM_MODEL: "shell-model"
    };

    loadRuntimeEnvFile(path, env);

    expect(env.ASSINI_LLM_PROVIDER).toBe("openai-compatible");
    expect(env.ASSINI_LLM_BASE_URL).toBe("http://127.0.0.1:12345/v1");
    expect(env.ASSINI_LLM_MODEL).toBe("shell-model");
    expect(env.ASSINI_LLM_MAX_TOKENS).toBe("4096");
  });
});
