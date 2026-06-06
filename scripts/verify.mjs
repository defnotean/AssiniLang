import { runVerificationSteps } from "./verifyLauncher.mjs";

const result = await runVerificationSteps();
process.exitCode = result.exitCode;
