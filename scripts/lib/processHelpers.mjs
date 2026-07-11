import { spawn } from "node:child_process";

export function quoteCmdArg(value) {
  if (/^[\w@./:\\=-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function npmSpawnSpec(args, { comSpec = process.env.ComSpec, platform = process.platform } = {}) {
  if (platform !== "win32") {
    return { command: "npm", args };
  }

  return {
    command: comSpec || "cmd.exe",
    args: ["/d", "/s", "/c", ["npm.cmd", ...args].map(quoteCmdArg).join(" ")]
  };
}

export async function run(command, args, options = {}) {
  const { logPrefix, ...spawnOptions } = options;
  if (logPrefix) {
    console.log(`${logPrefix} ${command} ${args.join(" ")}`);
  }

  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      windowsHide: true,
      ...spawnOptions
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}.`));
    });
  });
}
