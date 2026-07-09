import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runVerifyBeta } from "./verifyBeta.mjs";

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const result = await runVerifyBeta();
  process.exitCode = result.exitCode;
}
