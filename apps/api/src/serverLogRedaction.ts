export const FASTIFY_LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "err.message",
  "err.stack",
  "err.cause",
  "body.apiKey",
  "body.transcriptionApiKey",
  "body.ocrApiKey",
  "body.password",
  // Fastify request serializers nest the body under req when logging the request object.
  "req.body.apiKey",
  "req.body.transcriptionApiKey",
  "req.body.ocrApiKey",
  "req.body.password"
] as const;
