import { spawn } from "node:child_process";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_API_PORT = "4321";
const DEFAULT_WEB_PORT = "5173";

function readString(value, fallback) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function forwardStream(stream, destination) {
  stream?.on("data", (chunk) => {
    destination.write(chunk);
  });
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

export function createDevProcessSpecs({ platform = process.platform, env = process.env } = {}) {
  const host = readString(env.HOST, DEFAULT_HOST);
  const apiPort = readString(env.ASSINI_DEV_API_PORT ?? env.PORT, DEFAULT_API_PORT);
  const webPort = readString(env.ASSINI_DEV_WEB_PORT, DEFAULT_WEB_PORT);
  const baseEnv = {
    ...env,
    ASSINI_ENABLE_PROTOTYPE_AUTH: "true"
  };
  const commonOptions = {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: platform === "win32"
  };
  const apiCommand = createNpmSpawnSpec(platform, env, ["--workspace", "@assini/api", "run", "dev"]);
  const webCommand = createNpmSpawnSpec(platform, env, [
    "--workspace",
    "@assini/web",
    "run",
    "dev",
    "--",
    "--host",
    host,
    "--port",
    webPort
  ]);

  return [
    {
      name: "api",
      command: apiCommand.command,
      args: apiCommand.args,
      options: {
        ...commonOptions,
        env: {
          ...baseEnv,
          HOST: host,
          PORT: apiPort
        }
      }
    },
    {
      name: "web",
      command: webCommand.command,
      args: webCommand.args,
      options: {
        ...commonOptions,
        env: {
          ...baseEnv,
          ASSINI_API_HOST: host,
          ASSINI_API_PORT: apiPort
        }
      }
    }
  ];
}

export function startDevProcesses({
  platform = process.platform,
  env = process.env,
  spawnFn = spawn,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const specs = createDevProcessSpecs({ platform, env });
  const children = [];
  let shuttingDown = false;

  function stopChildren(signal = "SIGTERM") {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
  }

  for (const spec of specs) {
    let child;
    try {
      child = spawnFn(spec.command, spec.args, spec.options);
    } catch (error) {
      stopChildren();
      throw error;
    }

    children.push(child);
    forwardStream(child.stdout, stdout);
    forwardStream(child.stderr, stderr);
    child.on("error", (error) => {
      if (!shuttingDown) {
        stderr.write(`${spec.name} dev process failed: ${error.message}\n`);
        stopChildren();
        process.exitCode = 1;
      }
    });
    child.on("exit", (code, signal) => {
      if (!shuttingDown && code !== 0) {
        stopChildren();
        process.exitCode = code ?? (signal ? 1 : 0);
      }
    });
  }

  return { children, stopChildren };
}
