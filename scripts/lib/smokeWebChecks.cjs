function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseSmokeReport(report) {
  assert(report && typeof report === "object", "Web smoke report is not an object.");
  assert(report.bodyTextLength >= 40, "Web app rendered too little visible text.");
  assert(report.rootChildCount > 0, "Web app root is empty.");
  assert(report.headingCount > 0, `Web app rendered no heading (text length ${report.bodyTextLength}).`);
  assert(report.fatalEvents.length === 0, `Renderer reported fatal events: ${JSON.stringify(report.fatalEvents)}`);
  assert(report.consoleErrors.length === 0, `Renderer reported console errors: ${JSON.stringify(report.consoleErrors)}`);
  return report;
}

function smokeUrl(env = process.env) {
  const explicitUrl = env.ASSINI_WEB_SMOKE_URL;
  if (explicitUrl) return explicitUrl;
  const host = env.ASSINI_WEB_SMOKE_HOST || "127.0.0.1";
  const port = Number.parseInt(env.ASSINI_WEB_SMOKE_PORT || "4173", 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("ASSINI_WEB_SMOKE_PORT must be a valid TCP port.");
  }
  return `http://${host}:${port}`;
}

module.exports = { parseSmokeReport, smokeUrl };
