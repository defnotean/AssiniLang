import { spawn } from "node:child_process";
import { npmSpawnSpec } from "./lib/processHelpers.mjs";

function readString(value, fallback) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function createNpmSpawnSpec(platform, env, args) {
  return npmSpawnSpec(args, { comSpec: readString(env.ComSpec, "cmd.exe"), platform });
}

export function modelVerifyRequested(env = process.env) {
  const value = env.ASSINI_VERIFY_MODEL?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function resolveModelNameForVerify(env = process.env) {
  const value = env.ASSINI_VERIFY_MODEL?.trim();
  if (!value || value === "1" || value.toLowerCase() === "true") {
    return readString(env.ASSINI_VERIFY_MODEL_NAME, "Irene");
  }
  return value;
}

export function createVerifyBetaStep({ platform = process.platform, env = process.env } = {}) {
  if (!modelVerifyRequested(env)) {
    return null;
  }

  const npmSpec = createNpmSpawnSpec(platform, env, ["run", "model:verify"]);
  return {
    name: "model:verify",
    command: npmSpec.command,
    args: npmSpec.args,
    options: {
      stdio: "inherit",
      windowsHide: platform === "win32",
      env: {
        ...env,
        ASSINI_VERIFY_MODEL: resolveModelNameForVerify(env)
      }
    }
  };
}

function runStep(step, spawnFn) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(step.command, step.args, step.options);
    } catch (error) {
      resolve({ exitCode: 1, error });
      return;
    }

    child.once("error", (error) => {
      resolve({ exitCode: 1, error });
    });
    child.once("exit", (code, signal) => {
      resolve({ exitCode: code ?? (signal ? 1 : 0) });
    });
  });
}

export async function runVerifyBeta({
  env = process.env,
  platform = process.platform,
  spawnFn = spawn,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  if (!modelVerifyRequested(env)) {
    stdout.write(
      "[verify:beta] skipping model:verify (set ASSINI_VERIFY_MODEL=1 to run the live-model pack)\n"
    );
    return { exitCode: 0, skipped: true };
  }

  const step = createVerifyBetaStep({ platform, env });
  if (!step) {
    stdout.write(
      "[verify:beta] skipping model:verify (set ASSINI_VERIFY_MODEL=1 to run the live-model pack)\n"
    );
    return { exitCode: 0, skipped: true };
  }

  stdout.write("\n[verify:beta] model:verify (ASSINI_VERIFY_MODEL=1)\n");
  const result = await runStep(step, spawnFn);

  if (result.exitCode !== 0) {
    if (result.error) {
      stderr.write(`[verify:beta] model:verify failed to start: ${result.error.message}\n`);
    } else {
      stderr.write(`[verify:beta] model:verify failed with exit code ${result.exitCode}\n`);
    }
    return { exitCode: result.exitCode, skipped: false, failedStep: "model:verify" };
  }

  stdout.write("\n[verify:beta] model:verify passed\n");
  return { exitCode: 0, skipped: false };
}
