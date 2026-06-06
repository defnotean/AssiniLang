import { startDevProcesses } from "./devLauncher.mjs";

const { stopChildren } = startDevProcesses();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopChildren(signal);
  });
}
