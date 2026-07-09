import { runVerifyBeta } from "./verifyBeta.mjs";

const result = await runVerifyBeta();
process.exitCode = result.exitCode;
