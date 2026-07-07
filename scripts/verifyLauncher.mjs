import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERIFY_SCRIPT_NAMES = ["test", "check", "seed", "eval", "build"];

function readString(value, fallback) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function quoteCmdArg(value) {
  if (/^[\w@./:\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function createNpmSpawnSpec(platform, env, args) {
  if (platform !== "win32") {
    return { command: "npm", args };
  }

  return {
    command: readString(env.ComSpec, "cmd.exe"),
    args: ["/d", "/s", "/c", ["npm.cmd", ...args].map(quoteCmdArg).join(" ")]
  };
}

export function createVerificationSteps({ platform = process.platform, env = process.env } = {}) {
  const verificationDbPath = join(mkdtempSync(join(tmpdir(), "assini-verify-")), "local-db.json");

  return VERIFY_SCRIPT_NAMES.map((scriptName) => {
    const npmSpec = createNpmSpawnSpec(platform, env, ["run", scriptName]);
    const options = {
      stdio: "inherit",
      windowsHide: platform === "win32"
    };
    if (scriptName === "seed" || scriptName === "eval") {
      options.env = {
        ...env,
        ASSINI_DB_PATH: verificationDbPath
      };
    }

    return {
      name: scriptName,
      command: npmSpec.command,
      args: npmSpec.args,
      options
    };
  });
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

export async function runVerificationSteps({
  steps = createVerificationSteps(),
  spawnFn = spawn,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  for (const step of steps) {
    stdout.write(`\n[verify] ${step.name}\n`);
    const result = await runStep(step, spawnFn);

    if (result.exitCode !== 0) {
      if (result.error) {
        stderr.write(`[verify] ${step.name} failed to start: ${result.error.message}\n`);
      } else {
        stderr.write(`[verify] ${step.name} failed with exit code ${result.exitCode}\n`);
      }
      return { exitCode: result.exitCode, failedStep: step.name };
    }
  }

  stdout.write("\n[verify] all gates passed\n");
  return { exitCode: 0 };
}
