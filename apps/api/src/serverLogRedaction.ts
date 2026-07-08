export const FASTIFY_LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "body.apiKey",
  "body.transcriptionApiKey",
  "body.ocrApiKey",
  "body.password"
] as const;
